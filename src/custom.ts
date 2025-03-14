import {Options} from "@/models/Options.ts";
import * as pbuttons from "@/pbuttons.ts";
import {addIO} from "@/io.ts";
import * as pedcache from "@/pedcache.ts";
import * as utils from "@/utils.ts";
import {
    arc,
    ascending,
    hierarchy,
    HierarchyNode, pie, PieArcDatum,
    select,
    symbol,
    symbolCircle,
    symbolSquare,
    symbolTriangle,
    tree
} from "d3";
import {PedigreeDatasetNode} from "@/models/PedigreeDatasetNode.ts";
import {PieNodeData} from "@/models/Types/PieNodeData.ts";
import {addLabels} from "@/labels.ts";
import {addWidgets} from "@/widgets.ts";
import {init_zoom} from "@/zoom.ts";
import {init_dragging} from "@/dragging.ts";
import {Dimensions} from "@/models/Types/dimensions.ts";

export function build(options: Options) {
    let opts = {
        ...{ // defaults
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
        },
        ...options
    } as Options;

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

    if (!opts.dataset.length) {
        return
    }

    if (opts.DEBUG)
        utils.print_opts(opts);

    let svg_dimensions = utils.get_svg_dimensions(opts);

    const svg = createSvg(opts.targetDiv, svg_dimensions, opts.background)

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
        a.data.display_name = `${a.data.id} ${a.data.displayProbandDistance} ${a.data.realProbandDistance}`
        b.data.display_name = `${b.data.id} ${b.data.displayProbandDistance} ${b.data.realProbandDistance}`

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

function createSvg(target: string, dimensions: Dimensions, backgroundColor?: string) {
    // Create the svg HTML element inside the given target container
    let svg = select<SVGSVGElement, PedigreeDatasetNode>("#" + target)
        .append("svg:svg")
        .attr("width", dimensions.width)
        .attr("height", dimensions.height);

    // Draws the rectangular "frame" for our tree
    svg.append("rect")
        .attr("width", "100%")
        .attr("height", "100%")
        .attr("rx", 6)
        .attr("ry", 6)
        .style("stroke", "darkgrey")
        .style("stroke-width", 1)

    if (backgroundColor) {
        svg.style("fill", backgroundColor) // or non
    }

    return svg
}