/**
 /* © 2023 University of Cambridge
 /* SPDX-FileCopyrightText: 2023 University of Cambridge
 /* SPDX-License-Identifier: GPL-3.0-or-later
 **/
// @ts-nocheck
// Pedigree Tree Builder
import * as utils from './utils.ts';
import * as pbuttons from './pbuttons.js';
import * as pedcache from './pedcache.ts';
import {addIO} from './io.ts'
import {addWidgets} from './widgets.ts';
import {init_zoom} from './zoom.ts';
import {addLabels} from './labels.ts';
import {init_dragging} from './dragging.ts';
import {Options} from "@/models/Options.ts";
import {
    arc,
    hierarchy,
    HierarchyNode,
    pie,
    PieArcDatum,
    select,
    symbol,
    symbolCircle,
    symbolSquare,
    symbolTriangle,
    tree,
    ascending, descending
} from "d3";
import {PedigreeDatasetNode} from "@/models/PedigreeDatasetNode.ts";
import {Sex} from "@/models/Types/Sex.ts";
import {D3PartnerLink, PedigreePartnerLink} from "@/models/Types/PartnerLink.ts";
import {PieNodeData} from "@/models/Types/PieNodeData.ts";
import {computeDistancesFromProband} from "./utils.ts";


export function build(options: Options) {
    const defaults = { // defaults
        targetDiv: 'pedigree_edit',
        dataset: [{"name": "m21", "display_name": "father", "sex": "M", "top_level": true},
            {"name": "f21", "display_name": "mother", "sex": "F", "top_level": true},
            {"name": "ch1", "display_name": "me", "sex": "F", "mother": "f21", "father": "m21", "proband": true}],
        width: 600,
        height: 400,
        symbol_size: 35,
        zoomSrc: ['wheel', 'button'],
        zoomIn: 1.0,
        zoomOut: 1.0,
        dragNode: true,
        showWidgets: true,
        diseases: [{'type': 'breast_cancer', 'colour': '#F68F35'},
            {'type': 'breast_cancer2', 'colour': 'pink'},
            {'type': 'ovarian_cancer', 'colour': '#306430'},
            {'type': 'pancreatic_cancer', 'colour': '#4289BA'},
            {'type': 'prostate_cancer', 'colour': '#D5494A'}],
        labels: ['stillbirth', ['age', 'yob'], 'alleles',
            ['brca1_gene_test', 'brca2_gene_test', 'palb2_gene_test', 'chek2_gene_test', 'atm_gene_test'],
            ['rad51d_gene_test', 'rad51c_gene_test', 'brip1_gene_test', 'hoxb13_gene_test'],
            ['er_bc_pathology', 'pr_bc_pathology', 'her2_bc_pathology', 'ck14_bc_pathology', 'ck56_bc_pathology']],
        keep_proband_on_reset: false,
        font_size: '.75em',
        font_family: 'Helvetica',
        font_weight: 700,
        background: "#FAFAFA",
        node_background: '#fdfdfd',
        validate: true,
        DEBUG: false,
        onChange: () => {},
        onDone: () => {},
        onEdit: () => {}
    }

    const opts = utils.deepMerge<Options>(defaults, options) as Options;

    if (document.querySelectorAll("#fullscreen").length === 0) {
        // add undo, redo, fullscreen buttons and event listeners once
        pbuttons.addButtons(opts);
        addIO(opts);
    }
    const numberOfElementsInStore = pedcache.inStoreCount(opts)
    if (numberOfElementsInStore === -1) {
        pedcache.init_cache(opts);
    }

    pbuttons.updateButtons(opts, numberOfElementsInStore);

    // validate pedigree data
    utils.validatePedigree(opts);

    if (opts.dataset === undefined) {
        opts.dataset = []
    }

    // group top level nodes by partners
    opts.dataset = group_top_level(opts.dataset);

    if (!opts.dataset.length) {
        return
    }

    console.log('Person found in the dataset', opts.dataset.length)
    if (opts.DEBUG)
        utils.print_opts(opts);

    let svg_dimensions = utils.get_svg_dimensions(opts);

    // Create the svg HTML element inside the given target container
    let svg = select<SVGSVGElement, PedigreeDatasetNode>("#" + opts.targetDiv)
        .append("svg:svg")
        .attr("width", svg_dimensions.width)
        .attr("height", svg_dimensions.height);

    // Draws the rectangular "frame" for our tree
    svg.append("rect")
        .attr("width", "100%")
        .attr("height", "100%")
        .attr("rx", 6)
        .attr("ry", 6)
        .style("stroke", "darkgrey")
        .style("fill", opts.background) // or none
        .style("stroke-width", 1);

    // Prepare the conceptual group element to hold the tree
    let ped = svg.append("g")
        .attr("class", "diagram");

    let top_level = opts.dataset.filter((person) => !!person.top_level)

    let hidden_root: PedigreeDatasetNode = {
        famid: opts.dataset[0].famid,
        name: 'hidden_root',
        id: 0,
        hidden: true,
        children: top_level,
        sex: 'F',
        display_name: '',
        proband: false,
        status: '0',
        ashkenazi: false
    };

    utils.computeDistancesFromProband(opts.dataset)
    let partners = utils.buildTree(opts, hidden_root, hidden_root)[0];
    let root = hierarchy<PedigreeDatasetNode>(hidden_root);
    utils.roots[opts.targetDiv] = root;

    // get score at each depth used to adjust node separation
    let tree_dimensions = utils.get_tree_dimensions(opts);
    if (opts.DEBUG)
        console.log('opts.width=' + svg_dimensions.width + ' width=' + tree_dimensions.width +
            ' opts.height=' + svg_dimensions.height + ' height=' + tree_dimensions.height);

    // Gives horizontal spacing to sibling nodes
    let treemap = tree<PedigreeDatasetNode>()
        .separation((a: HierarchyNode<PedigreeDatasetNode>, b: HierarchyNode<PedigreeDatasetNode>) => {
            return a.parent === b.parent || a.data.hidden || b.data.hidden ? 1.2 : 2.2;
        })
        .size([tree_dimensions.width, tree_dimensions.height]);

    // Sorts the nodes by id
    let nodes = treemap(root.sort(function (a, b) {
        a.data.display_name = `${a.data.id} ${a.data.displayProbandDistance || ''} ${a.data.realProbandDistance | ''}`
        b.data.display_name = `${b.data.id} ${b.data.displayProbandDistance || ''} ${b.data.realProbandDistance || ''}`

        return ascending(a.data.id, b.data.id);
    }));

    let flattenNodes = nodes.descendants();

    // check the number of visible nodes equals the size of the pedigree dataset
    let vis_nodes = opts.dataset.map((p) => p.hidden ? null : p);
    if (vis_nodes.length !== opts.dataset.length) {
        throw utils.create_err('NUMBER OF VISIBLE NODES DIFFERENT TO NUMBER IN THE DATASET');
    }

    utils.adjustNodesCoordinates(opts, nodes, flattenNodes);


    let partnerLinkNodes = utils.getD3PartnerLinkNodes(flattenNodes, partners);

    // could be removed, seems debug only
    //checkPartnerLinks(opts, ptrLinkNodes);   // check for crossing of partner lines

    let allNodes = ped.selectAll<SVGElement, HierarchyNode<PedigreeDatasetNode>>(".node")
        .data(nodes.descendants())
        .enter()
        .append("g")
        .attr("transform", function (d, _i) {
            return "translate(" + d.x + "," + d.y + ")";
        });


    // provide a border to the node
    allNodes.filter(function (d) {
        return !d.data.hidden;
    })
        .append("path")
        .attr("shape-rendering", "geometricPrecision")
        .attr("transform", function (d) {
            return !has_gender(d.data.sex) && !(d.data.miscarriage || d.data.termination) ? "rotate(45)" : "";
        })
        .attr("d", symbol().size(function (_d) {
            return (opts.symbol_size * opts.symbol_size) + 2;
        })
            .type(function (d) {
                if (d.data.miscarriage || d.data.termination)
                    return symbolTriangle;
                return d.data.sex === "F" ? symbolCircle : symbolSquare;
            }))
        .style("stroke", function (d) {
            return d.data.age && d.data.yob && !d.data.exclude ? "#303030" : "grey";
        })
        .style("stroke-width", function (d) {
            return d.data.age && d.data.yob && !d.data.exclude ? ".3em" : ".1em";
        })
        .style("stroke-dasharray", function (d) {
            return !d.data.exclude ? null : ("3, 3");
        })
        .style("fill", "none");

    // set a clippath
    allNodes.filter(function (d) {
        return !(d.data.hidden && !opts.DEBUG);
    })
        .append("clipPath")
        .attr("id", function (d) {
            return d.data.name;
        }).append("path")
        .attr("class", "node")
        .attr("transform", function (d) {
            return !has_gender(d.data.sex) && !(d.data.miscarriage || d.data.termination) ? "rotate(45)" : "";
        })
        .attr("d", symbol().size(function (d) {
            if (d.data.hidden)
                return opts.symbol_size * opts.symbol_size / 5;
            return opts.symbol_size * opts.symbol_size;
        })
        .type(function (d) {
            if (d.data.miscarriage || d.data.termination)
                return symbolTriangle;
            return d.data.sex === "F" ? symbolCircle : symbolSquare;
        }));

    // pie plots for disease colours
    let pienode = allNodes.filter(function (d) {
        return !(d.data.hidden && !opts.DEBUG);
    }).selectAll("pienode")
        .data(function (d) {	 		// set the disease data for the pie plot
            let ncancers = 0;
            let cancers = opts.diseases.map((_, i) => {
                if (utils.prefixInObj(opts.diseases[i].type, d.data)) {
                    ncancers++;
                    return 1;
                }

                return 0;
            });
            if (ncancers === 0) {
                cancers = [1];
            }
            return [cancers.map((val, _i) => {
                return {
                    'cancer': val,
                    'ncancers': ncancers,
                    'id': d.data.name,
                    'sex': d.data.sex,
                    'proband': d.data.proband,
                    'hidden': d.data.hidden,
                    'affected': d.data.affected,
                    'exclude': d.data.exclude
                } as PieNodeData
            })];
        })
        .enter()
        .append("g");

    type PieArcDatumInternal = PieArcDatum<PieNodeData>;

    const pieGenerator = pie<PieNodeData>()
        .value((d) => d.cancer || 0);

    const arcGenerator = arc<PieArcDatumInternal>()
        .innerRadius(0)
        .outerRadius(opts.symbol_size);

    pienode.selectAll("path")
        .data(pieGenerator)
        .enter().append("path")
        .attr("clip-path", function (d) {
            return "url(#" + d.data.id + ")";
        }) // clip the rectangle
        .attr("class", "pienode")
        .attr("d", arcGenerator)
        .style("fill", function (d, i) {
            if (d.data.exclude) {
                return 'lightgrey';
            }

            if (d.data.ncancers === 0) {
                if (d.data.affected) {
                    return 'darkgrey';
                }

                return opts.node_background;
            }

            return opts.diseases[i].colour;
        });

    // adopted in/out brackets
    drawAdoptedBrackets(allNodes, opts.symbol_size)


    // alive status = 0; dead status = 1
    drawDeathStatus(allNodes, opts.symbol_size)

    /*
     * let warn = node.filter(function (d) { return (!d.data.age || !d.data.yob) && !d.data.hidden; }).append("text") .attr('font-family', 'FontAwesome')
     * .attr("x", ".25em") .attr("y", -(0.4 * opts.symbol_size), -(0.2 * opts.symbol_size)) .html("\uf071"); warn.append("svg:title").text("incomplete");
     */
    // add display names and labels defined by opts.labels
    addLabels(opts, allNodes);

    //
    if (opts.showWidgets) addWidgets(opts, allNodes);

    const clashingNodes = findClashingNodes(
        ped,
        root,
        partnerLinkNodes,
        opts.dataset,
        flattenNodes,
    )

    console.log('Clashing nodes', clashingNodes)
    const clashingNodeNames = clashingNodes.map((node) => node.data.name)
    clashingNodes.forEach((node) => {
        const partners = utils.getPartners(opts.dataset || [], node.data)
        const partnersAlsoClashing = partners
            .map((partner) => partner.name)
            .find((name) => clashingNodeNames.includes(name))
        const d3Partners = partners
            .map((partner) => utils.getD3NodeByName(flattenNodes, partner.name))
            .filter((partner) => !!partner)

        // Check if partners are not also clashing, then don't raise the node and the line will be drawn around it
        if (partners.length <= 0 || partnersAlsoClashing) {
            node.y -= opts.symbol_size * 2
        }

        //console.log('clashing node', node, ...partners)
        if (!node.data.parent_node?.length) {
            return
        }

        // We need to raise the hidden parent as well so that the children connection is displayed properly
        const d3Parent = utils.getD3NodeByName(flattenNodes, node.data.parent_node[0].name)

        if (!d3Parent) {
            return;
        }

        d3Parent.y = node.y
    })

    allNodes.attr('transform', (d) => {
        return "translate(" + d.x + "," + d.y + ")";
    })

    console.log(partnerLinkNodes)
    drawConnectionLinesBetweenPartners(
        ped,
        root,
        partnerLinkNodes,
        opts.dataset,
        flattenNodes,
        clashingNodes,
        opts.symbol_size
    )


    // links to children
    drawLinksToChildren(ped, root, opts.dataset || [], flattenNodes, opts.symbol_size)

    // draw proband arrow
    drawProbandArrow(ped, opts.dataset, flattenNodes, opts.symbol_size)

    // drag and zoom
    init_zoom(opts, svg);
    // drag nodes
    if (opts.dragNode) {
        init_dragging(opts, allNodes);
    }
    return opts;
}

function drawAdoptedBrackets(
    allNodes: Selection<SVGGElement, HierarchyNode<PedigreeDatasetNode>, SVGGElement, PedigreeDatasetNode>,
    symbolSize: number
)
{
    allNodes.filter((d) => {
        return !d.data.hidden && (!!d.data.adopted_in || !!d.data.adopted_out);
    })
        .append("path")
        .attr("d", function (_d) {
            let dx = -(symbolSize * 0.66);
            let dy = -(symbolSize * 0.64);
            let indent = symbolSize / 4;
            return get_bracket(dx, dy, indent, opts) + get_bracket(-dx, dy, -indent, opts);
        })
        .style("stroke", function (d) {
            return d.data.age && d.data.yob && !d.data.exclude ? "#303030" : "grey";
        })
        .style("stroke-width", function (_d) {
            return ".1em";
        })
        .style("stroke-dasharray", function (d) {
            return !d.data.exclude ? null : ("3, 3");
        })
        .style("fill", "none");
}

function drawDeathStatus(
    allNodes: Selection<SVGGElement, HierarchyNode<PedigreeDatasetNode>, SVGGElement, PedigreeDatasetNode>,
    symbolSize: number
) {
    allNodes.filter(function (d) {
        return d.data.status === "1";
    })
        .append('line')
        .style("stroke", "black")
        .attr("x1", function (_d, _i) {
            return -0.6 * symbolSize;
        })
        .attr("y1", function (_d, _i) {
            return 0.6 * symbolSize;
        })
        .attr("x2", function (_d, _i) {
            return 0.6 * symbolSize;
        })
        .attr("y2", function (_d, _i) {
            return -0.6 * symbolSize;
        });
}

function  drawPathAround(clash: HierarchyNode<PedigreeDatasetNode>[], dx: number, dy1: number, dy2: number, parent_node: HierarchyNode<PedigreeDatasetNode> | undefined, cshift: number) {
    let extend = function (i: number, l: number = 0) {
        if (i + 1 < l)   // && Math.abs(clash[i] - clash[i+1]) < (opts.symbol_size*1.25)
            return extend(++i);
        return i;
    };

    let path = "";
    for (let j = 0; j < clash.length; j++) {
        let k = extend(j, clash.length);
        let dx1 = clash[j].x - dx - cshift;
        let dx2 = clash[k].x + dx + cshift;

        if (parent_node) {
            const parentNodeX = parent_node.x || 0
            if (parentNodeX > dx1 && parentNodeX < dx2) {
                parent_node.y = dy2;
            }
        }

        path += "L" + dx1 + "," + (dy1 - cshift) +
            "L" + dx1 + "," + (dy2 - cshift) +
            "L" + dx2 + "," + (dy2 - cshift) +
            "L" + dx2 + "," + (dy1 - cshift);
        j = k;
    }

    return path;
}

function findClashingNodes(
    ped: Selection<SVGGElement, PedigreeDatasetNode, HTMLElement, any>,
    root: HierarchyNode<PedigreeDatasetNode>,
    partnerLinkNodes: D3PartnerLink[],
    dataset: PedigreeDatasetNode[],
    flattenNodes: HierarchyNode<PedigreeDatasetNode>[],
) {
    let clashingNodes: HierarchyNode<PedigreeDatasetNode>[] = []
    ped.selectAll(".partner")
        .data(partnerLinkNodes)
        .enter()
        .insert("path", "g")
        .attr("fill", "none")
        .attr("stroke", "#000")
        .attr("shape-rendering", "auto")
        .attr('d', function (d, _i) {
            let clash = checkPartnerLinkClashes(root, flattenNodes, d);
            clashingNodes = [...clashingNodes, ...clash]
        })

    return clashingNodes
}
function drawConnectionLinesBetweenPartners(
    ped: Selection<SVGGElement, PedigreeDatasetNode, HTMLElement, any>,
    root: HierarchyNode<PedigreeDatasetNode>,
    partnerLinkNodes: D3PartnerLink[],
    dataset: PedigreeDatasetNode[],
    flattenNodes: HierarchyNode<PedigreeDatasetNode>[],
    clashingNodes: HierarchyNode<PedigreeDatasetNode>[],
    symbolSize: number
) {

    let clash_depth: Record<number, number> = {};
    ped.selectAll(".partner")
        .data(partnerLinkNodes)
        .enter()
        .insert("path", "g")
        .attr("fill", "none")
        .attr("stroke", "#000")
        .attr("shape-rendering", "auto")
        .attr('d', function (d: D3PartnerLink, _i) {
            let node1 = utils.getD3NodeByName(flattenNodes, d.female?.data.name);
            let node2 = utils.getD3NodeByName(flattenNodes, d.male?.data.name);
            let consanguinity = utils.consanguinity(node1, node2, dataset);
            let divorced = (!!d.female?.data.divorced && d.female?.data.divorced === d.male?.data.name);

            let motherX = d.female?.x || 0
            let motherY = d.female?.y || 0
            let fatherX = d.male?.x || 0
            let fatherY = d.male?.y || 0
            let x1 = (motherX < fatherX ? motherX : fatherX);
            let x2 = (motherX < fatherX ? fatherX : motherX);
            let dy1 = motherY;
            let dy2, dx, parent_node;

            // identify clashes with other nodes at the same depth
            let clash = checkPartnerLinkClashes(root, flattenNodes, d);

            let path = "";

            if (clash.length) {
                // Instead of drawing a straight line, draw a line around all the nodes in the way
                const horizontalSpacing = 8
                const verticalSpacing = 8
                const motherDepth = d.female?.depth || 0
                if (motherDepth in clash_depth) {
                    clash_depth[motherDepth] += 0;
                } else {
                    clash_depth[motherDepth] = 0;
                }

                dy1 -= clash_depth[motherDepth];
                // Horizontal space before and after going around a node
                dx = clash_depth[motherDepth] + (symbolSize / 2) + horizontalSpacing;

                let parent_nodes = d.female?.data.parent_node;
                if (parent_nodes !== undefined) {
                    let parent_node_name = parent_nodes[0].name;

                    for (let ii = 0; ii < parent_nodes.length; ii++) {
                        if (utils.getName(parent_nodes[ii].father) === d.male?.data.name &&
                            utils.getName(parent_nodes[ii].mother) === d.female?.data.name)
                            parent_node_name = parent_nodes[ii].name;
                    }

                    parent_node = utils.getD3NodeByName(flattenNodes, parent_node_name);
                    if (parent_node !== undefined) {
                        parent_node.y = dy1; // adjust height of parent node
                    }
                    clash.sort(function (a, b) {
                        return a.x - b.x;
                    });

                    // Go higher around the nodes
                    dy2 = (dy1 - (symbolSize / 2) - verticalSpacing);
                    path = drawPathAround(clash, dx, dy1, dy2, parent_node, 0);
                }
            }

            let divorce_path = "";
            if (divorced && !clash.length) {
                divorce_path = "M" + (x1 + ((x2 - x1) * .66) + 6) + "," + (dy1 - 6) +
                    "L" + (x1 + ((x2 - x1) * .66) - 6) + "," + (dy1 + 6) +
                    "M" + (x1 + ((x2 - x1) * .66) + 10) + "," + (dy1 - 6) +
                    "L" + (x1 + ((x2 - x1) * .66) - 2) + "," + (dy1 + 6);
            }

            if (consanguinity) {
                // consanguineous, draw double line between partners

                dy1 = (motherX < fatherX ? motherY : fatherY);
                dy2 = (motherX < fatherX ? fatherY : motherY);

                let cshift = 3;
                if (Math.abs(dy1 - dy2) > 0.1) {	  // DIFFERENT LEVEL
                    return "M" + x1 + "," + dy1 + "L" + x2 + "," + dy2 +
                        "M" + x1 + "," + (dy1 - cshift) + "L" + x2 + "," + (dy2 - cshift);
                } else {						   // SAME LEVEL
                    let path2 = (clash.length ? drawPathAround(clash, dx!, dy1, dy2, parent_node, cshift) : ""); // If clash then dx is defined
                    return "M" + x1 + "," + dy1 + path + "L" + x2 + "," + dy1 +
                        "M" + x1 + "," + (dy1 - cshift) + path2 + "L" + x2 + "," + (dy1 - cshift) + divorce_path;
                }
            }

            return "M" + x1 + "," + dy1 + path + "L" + x2 + "," + dy1 + divorce_path;
        });
}

function drawLinksToChildren(
    ped: Selection<SVGGElement, PedigreeDatasetNode, HTMLElement, any>,
    root: HierarchyNode<PedigreeDatasetNode>,
    dataset: PedigreeDatasetNode[],
    flattenNodes: HierarchyNode<PedigreeDatasetNode>[],
    symbolSize: number,
    debug?: boolean = false
) {
    ped.selectAll(".link")
        //.data(root.links(nodes.descendants()))
        .data(root.links())
        .enter()
        .filter(function (d) {
            // filter unless debug is set
            return (debug ||
                (d.target.data.noparents === undefined && d.source.parent !== null && !d.target.data.hidden));
        })
        .insert("path", "g")
        .attr("fill", "none")
        .attr("stroke-width", function (d, _i) {
            if (d.target.data.noparents !== undefined || d.source.parent === null || d.target.data.hidden)
                return 1;
            return (debug ? 2 : 1);
        })
        .attr("stroke", function (d, _i) {
            if (d.target.data.noparents !== undefined || d.source.parent === null || d.target.data.hidden)
                return 'pink';
            return "#000";
        })
        .attr("stroke-dasharray", function (d, _i) {
            if (!d.target.data.adopted_in) {
                return null;
            }

            const targetY = d.target.y || 0
            const targetX = d.target.x || 0
            const sourceY = d.source.y || 0
            const sourceX = d.source.x || 0
            let dash_len = Math.abs(sourceY - ((sourceY + targetY) / 2));
            let dash_array = [dash_len, 0, Math.abs(sourceX - targetX), 0];
            let twins = utils.getTwins(dataset, d.target.data);
            if (twins.length >= 1) dash_len = dash_len * 3;
            for (let usedlen = 0; usedlen < dash_len; usedlen += 10) {
                dash_array = [...dash_array, ...[5, 5]];
            }
            return dash_array;
        })
        .attr("shape-rendering", function (d, _i) {
            if (d.target.data.mztwin || d.target.data.dztwin)
                return "geometricPrecision";
            return "auto";
        })
        .attr("d", function (d, _i) {
            if (d.target.data.mztwin || d.target.data.dztwin) {
                // get twin position
                let twins = utils.getTwins(dataset, d.target.data);
                if (twins.length >= 1) {
                    let twinx = 0;
                    let xmin = d.target.x || 0;
                    //let xmax = d.target.x;
                    for (let t = 0; t < twins.length; t++) {
                        let thisx = utils.getD3NodeByName(flattenNodes, twins[t].name)?.x || 0;
                        if (xmin > thisx) xmin = thisx;
                        //if(xmax < thisx) xmax = thisx;
                        twinx += thisx;
                    }

                    const targetY = d.target.y || 0
                    const targetX = d.target.x || 0
                    const sourceY = d.source.y || 0
                    let xmid = ((targetX + twinx) / (twins.length + 1));
                    let ymid = ((sourceY + targetY) / 2);

                    let xhbar = "";
                    if (xmin === d.target.x && d.target.data.mztwin) {
                        // horizontal bar for mztwins
                        let xx = (xmid + d.target.x) / 2;
                        let yy = (ymid + (targetY - (symbolSize / 2))) / 2;
                        xhbar = "M" + xx + "," + yy +
                            "L" + (xmid + (xmid - xx)) + " " + yy;
                    }

                    return "M" + (d.source.x) + "," + (d.source.y) +
                        "V" + ymid +
                        "H" + xmid +
                        "L" + (d.target.x) + " " + (targetY - (symbolSize / 2)) +
                        xhbar;
                }
            }

            if (d.source.data.mother) {   // check parents depth to see if they are at the same level in the tree
                let ma = utils.getD3NodeByName(flattenNodes, utils.getName(d.source.data.mother));
                let pa = utils.getD3NodeByName(flattenNodes, utils.getName(d.source.data.father));

                if (ma && pa && ma.depth !== pa.depth) {
                    const maY = ma.y || 0
                    const paY = pa.y || 0
                    return "M" + (d.source.x) + "," + ((maY + paY) / 2) +
                        "H" + (d.target.x) +
                        "V" + (d.target.y);
                }
            }

            return "M" + (d.source.x) + "," + (d.source.y) +
                "V" + (((d.source.y || 0) + (d.target.y || 0)) / 2) +
                "H" + (d.target.x) +
                "V" + (d.target.y);
        });
}

function drawProbandArrow(
    ped: Selection<SVGGElement, PedigreeDatasetNode, HTMLElement, any>,
    dataset: PedigreeDatasetNode[],
    flattenNodes: HierarchyNode<PedigreeDatasetNode>[],
    symbolSize: number
) {
    let probandIdx = utils.getProbandIndex(dataset);
    if (probandIdx) {
        let probandNode = utils.getD3NodeByName(flattenNodes, dataset[probandIdx].name);

        const probandX = probandNode?.x || 0
        const probandY = probandNode?.y || 0

        let triid = "triangle" + utils.makeid(3);
        ped.append("svg:defs").append("svg:marker")    // arrow head
            .attr("id", triid)
            .attr("refX", 6)
            .attr("refY", 6)
            .attr("markerWidth", 20)
            .attr("markerHeight", 20)
            .attr("orient", "auto")
            .append("path")
            .attr("d", "M 0 0 12 6 0 12 3 6")
            .style("fill", "black");

        ped.append("line")
            .attr("x1", probandX - (symbolSize / 0.7))
            .attr("y1", probandY + (symbolSize / 1.4))
            .attr("x2", probandX - (symbolSize / 1.4))
            .attr("y2", probandY + (symbolSize / 4))
            .attr("stroke-width", 1)
            .attr("stroke", "black")
            .attr("marker-end", "url(#" + triid + ")");
    }
}

function has_gender(sex: Sex) {
    return sex === "M" || sex === "F";
}

//adopted in/out brackets
function get_bracket(dx: number, dy: number, indent: number, opts: Options) {
    return "M" + (dx + indent) + "," + dy +
        "L" + dx + " " + dy +
        "L" + dx + " " + (dy + (opts.symbol_size * 1.28)) +
        "L" + dx + " " + (dy + (opts.symbol_size * 1.28)) +
        "L" + (dx + indent) + "," + (dy + (opts.symbol_size * 1.28))
}

// check for crossing of partner lines
function checkPartnerLinks(opts: Options, ptrLinkNodes: D3PartnerLink[]) {
    for (let a = 0; a < ptrLinkNodes.length; a++) {
        let clash = checkPartnerLinkClashes(opts, ptrLinkNodes[a]);
        if (clash.length)
            console.log("CLASH :: " + ptrLinkNodes[a].female?.data.name + " " + ptrLinkNodes[a].male?.data.name, clash);
    }
}

export function checkPartnerLinkClashes(
    root: HierarchyNode<PedigreeDatasetNode>,
    flattenNodes: HierarchyNode<PedigreeDatasetNode>[],
    anode: HierarchyNode<PedigreeDatasetNode> | D3PartnerLink
): HierarchyNode<PedigreeDatasetNode>[]  {
    let mother, father;
    if ('name' in anode) {
        const searchResultNode = utils.getD3NodeByName(flattenNodes, anode.name);
        if (searchResultNode === undefined || !('mother' in searchResultNode.data))
            return null;
        mother = utils.getD3NodeByName(flattenNodes, utils.getName(searchResultNode.data.mother));
        father = utils.getD3NodeByName(flattenNodes, utils.getName(searchResultNode.data.father));
    } else {
        mother = anode.female;
        father = anode.male;
    }

    if (father === undefined || mother === undefined) {
        return []
    }

    const motherX = mother?.x || 0
    const motherY = mother?.y || 0
    const fatherX = father?.x || 0

    let x1 = (motherX < fatherX ? motherX : fatherX);
    let x2 = (motherX < fatherX ? fatherX : motherX);
    let dy = motherY;

    // identify clashes with other nodes at the same depth
    return flattenNodes.map((bnode) => {
        const bnodeX = bnode.x || 0
        if (bnode.data.hidden) {
            return null
        }

        // Same height and between father's x and mother's x position
        return bnode.y === dy && bnodeX > x1 && bnodeX < x2 ? bnode : null;
    }).filter((value) => value !== null);
}

// group top_level nodes by their partners at the beginning of the dataset
function group_top_level(dataset: PedigreeDatasetNode[]): PedigreeDatasetNode[] {
    // let top_level = $.map(dataset, function(val, i){return 'top_level' in val && val.top_level ? val : null;});
    // calculate top_level nodes
    for (let i = 0; i < dataset.length; i++) {
        if (utils.getDepth(dataset, dataset[i].name) === 2) {
            dataset[i].top_level = true
        }
    }


    let top_level = [];
    let top_level_seen: string[] = [];
    for (let i = 0; i < dataset.length; i++) {
        let node = dataset[i];
        if (!('top_level' in node) || !node.top_level || top_level_seen.includes(node.name)) {
            // Node is not top_level or has already been seen -> skip
            continue;
        }

        // Here the node is top_level and has not been seen yet
        top_level_seen.push(node.name);
        top_level.push(node);
        let partnersNames = utils.getPartnersNames(dataset, node);

        // We include the partners as top level in case they weren't already
        for (let j = 0; j < partnersNames.length; j++) {
            if (!top_level_seen.includes(partnersNames[j])) {
                top_level_seen.push(partnersNames[j]);
                const partnerNode = utils.getPedigreeNodeByName(dataset, partnersNames[j])
                if (partnerNode) {
                    top_level.push(partnerNode);
                }
            }
        }
    }

    //Create a dataset with all the non-top level nodes
    let newdataset = dataset
        .filter((val) => !('top_level' in val) || !val.top_level)

    // Add all the top level nodes back tot the beginning of the dataset
    for (let i = top_level.length; i > 0; --i) {
        newdataset.unshift(top_level[i - 1])
    }

    return newdataset;
}

export function rebuild(opts: Options) {
    const targetElement = document.getElementById(opts.targetDiv)
    if (targetElement) {
        targetElement.innerHTML = '';
    }
    pedcache.init_cache(opts);
    try {
        build(opts);
    } catch (e) {
        console.error(e);
        throw e;
    }

    try {
        // @ts-ignore
        templates.update(opts);		// eslint-disable-line no-undef
    } catch (e) {
        // templates not declared
    }
}

document.addEventListener('rebuild', (event: Event) => {
    const customEvent = event as CustomEvent<Options>;
    rebuild(customEvent.detail);
    e.stopPropagation();

});

document.addEventListener('build', (event: Event) => {
    const customEvent = event as CustomEvent<Options>;
    build(customEvent.detail);
    e.stopPropagation();
});
