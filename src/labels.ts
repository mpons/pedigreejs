/**
 /* © 2023 University of Cambridge
 /* SPDX-FileCopyrightText: 2023 University of Cambridge
 /* SPDX-License-Identifier: GPL-3.0-or-later
 **/

import {prefixInObj} from './utils.ts';
import {Options} from "@/models/Options.ts";
import {HierarchyNode, HierarchyPointNode, Selection} from "d3";
import {PedigreeDatasetNode} from "@/models/PedigreeDatasetNode.ts";
import {PedigreeGeneTestsResults} from "@/models/PedigreeGeneTestsResults.ts";

export function addLabels(opts: Options, node: Selection<SVGGElement, HierarchyPointNode<PedigreeDatasetNode>, SVGElement, PedigreeDatasetNode>) {
    // names of individuals
    addLabel(opts,
        node,
        -(0.4 * opts.symbol_size),
        -(0.1 * opts.symbol_size),
        (d) => {
            if (opts.DEBUG) {
                const alternative = ('name' in d.data ? d.data.name : 'N/A')
                return ('display_name' in d.data ? d.data.display_name : alternative) + '  ' + d.data.id;
            }

            return 'display_name' in d.data ? d.data.display_name : '';
        }
        , undefined,
        ['display_name']);

    let font_size = parseInt(getPx(opts)) + 4;
    // display age/yob label first
    for (let ilab = 0; ilab < opts.labels.length; ilab++) {
        let label = opts.labels[ilab];
        let arr = (Array.isArray(label) ? label : [label]);
        if (arr.indexOf('age') > -1 || arr.indexOf('yob') > -1) {
            addLabel(opts, node, -opts.symbol_size,
                function (d) {
                    return ypos(d, arr, font_size);
                },
                function (d) {
                    return getText(d, arr);
                }, 'indi_details', arr);
        }
    }

    // individuals disease details
    for (let i = 0; i < opts.diseases.length; i++) {
        let disease = opts.diseases[i].type;
        addLabel(opts, node, -opts.symbol_size,
            function (d) {
                return ypos(d, [disease], font_size);
            },
            function (d) {
                let dis = disease.replace('_', ' ').replace('cancer', 'ca.');
                const key = disease + '_diagnosis_age'
                return key in d.data ? dis + ": " + d.data[(key as keyof PedigreeDatasetNode)] : '';
            }, 'indi_details', [disease]);
    }

    // display other labels defined in opts.labels e.g. alleles/genotype data
    for (let ilab = 0; ilab < opts.labels.length; ilab++) {
        let label = opts.labels[ilab];
        let arr = (Array.isArray(label) ? label : [label]);
        if (arr.indexOf('age') === -1 && arr.indexOf('yob') === -1) {
            addLabel(opts, node, -opts.symbol_size,
                function (d) {
                    return ypos(d, arr, font_size);
                },
                function (d) {
                    return getText(d, arr);
                }, 'indi_details', arr);
        }
    }

    const arr = ['notes']
    addLabel(opts, node, -opts.symbol_size,
        function (d) {
            return ypos(d, arr, font_size);
        },
        function (d) {
            return getText(d, arr, -opts.symbol_size);
        }, 'indi_details', arr);
}

function getText(d: HierarchyNode<PedigreeDatasetNode>, arr: string[], xPos?: number) {
    let txt = "";
    for (let l = 0; l < arr.length; l++) {
        let this_label = arr[l];
        if (Object(d.data).hasOwnProperty(this_label)) {
            const property = d.data[(this_label as keyof PedigreeDatasetNode)]
            if (property === undefined) {
                continue
            }

            if (this_label === 'alleles') {
                let vars = d.data.alleles?.split(';') || [];
                for (let ivar = 0; ivar < vars.length; ivar++) {
                    if (vars[ivar] !== "") txt += vars[ivar] + ';';
                }
            } else if (this_label === 'age') {
                txt += property + 'y ';
            } else if (this_label === 'stillbirth') {
                txt += "SB";
            } else if (this_label.match("_gene_test$") && Object(property).hasOwnProperty('result')) {
                let r = (property as PedigreeGeneTestsResults).result.toUpperCase();
                //let t = d.data[this_label]['type'];
                if (r !== "-") {
                    txt += this_label.replace('_gene_test', '').toUpperCase()
                    txt += (r === 'P' ? '+ ' : (r === 'N' ? '- ' : ' '));
                }
            } else if (this_label.match("_bc_pathology$")) {
                let r = (property as string)?.toUpperCase();
                txt += this_label.replace('_bc_pathology', '').toUpperCase()
                txt += (r === 'P' ? '+ ' : (r === 'N' ? '- ' : ' '));
            } else if (this_label === 'notes' && xPos) {
                txt = breakLongLabelTexts((property as string), xPos);
            } else {
                txt += property;
            }
        }
    }

    return txt !== "" ? txt : null
}

function ypos(d: HierarchyNode<PedigreeDatasetNode>, labels: string[], font_size: number) {
    if (!nodeHasLabel(d, labels)) {
        return
    }
    // @ts-ignore
    d.y_offset = (!d.y_offset ? font_size * 2.35 : d.y_offset + font_size);

    // @ts-ignore
    return d.y_offset;
}

function nodeHasLabel(d: HierarchyNode<PedigreeDatasetNode>, labels: string[]) {
    for (let l = 0; l < labels.length; l++) {
        if (prefixInObj(labels[l], d.data)) return true;
    }
    return false;
}

/**
 *
 * @returns {*}
 * @param ftext string
 * @param xPos string
 */
function breakLongLabelTexts(ftext: string, xPos: number) {
    const wordsPerLine = 4
    let result = ''

    const parts = ftext.split(' ')
    if (parts.length < wordsPerLine) {
        return '<tspan x="' + xPos + '" dy="1.2em">' + ftext + '</tspan>'
    }

    let i = 0
    while (i < parts.length - wordsPerLine) {
        const text = parts.slice(i, i + wordsPerLine).join(' ')
        result += '<tspan x="' + xPos + '" dy="1.2em">' + text + '</tspan>'
        i += wordsPerLine
    }

    if (i < parts.length) {
        const text = parts.slice(i, parts.length).join(' ')
        result += '<tspan x="' + xPos + '" dy="1.2em">' + text + '</tspan>'
    }

    return result
}

// add label to node
function addLabel(
    opts: Options,
    node: Selection<SVGGElement, HierarchyPointNode<PedigreeDatasetNode>, SVGElement, PedigreeDatasetNode>,
    fx: number | ((d: HierarchyNode<PedigreeDatasetNode>) => number),
    fy: number | ((d: HierarchyNode<PedigreeDatasetNode>) => number),
    ftext: string | ((d: HierarchyNode<PedigreeDatasetNode>) => string | null),
    class_label: string | undefined,
    labels: string[]
) {
    let rotateValue = ''
    if (labels.includes('display_name')) {
        rotateValue = 'transform: rotate(-45deg)'
    }
    node.filter(function (d) {
        return !d.data.hidden && (!labels || nodeHasLabel(d, labels));
    }).append("text")
        .attr("class", (class_label ? class_label + ' ped_label' : 'ped_label'))
        .attr("x", fx)
        .attr("y", fy)
        .attr("font-family", opts.font_family)
        .attr("font-size", opts.font_size)
        .attr("font-weight", opts.font_weight)
        .attr("style", rotateValue)
        .html(ftext);
}

// get height in pixels
function getPx(opts: Options) {
    let emVal = opts.font_size;

    if (emVal.indexOf("px") > -1) {
        return emVal.replace('px', '')
    } else if (emVal.indexOf("em") === -1) {
        return emVal
    }
    const floatValue = parseFloat(emVal.replace('em', ''));
    const targetElement = document.getElementById(opts.targetDiv)
    if (targetElement === null) {
        return '' + (14 * floatValue)
    }
    return '' + ((parseFloat(getComputedStyle(targetElement).fontSize) * floatValue) - 1.0);
}
