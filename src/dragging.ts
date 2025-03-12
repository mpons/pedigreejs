import  * as utils from './utils.js';
import {current as pedcache_current} from './pedcache.js';
import {Options} from "@/models/Options.ts";
import {D3DragEvent, HierarchyPointNode, Selection, drag, select} from 'd3';
import {PedigreeDatasetNode} from "@/models/PedigreeDatasetNode.ts";


// initialise node dragging - SHIFT + DRAG
export function init_dragging(
	opts: Options,
	node: Selection<SVGGElement, HierarchyPointNode<PedigreeDatasetNode>, SVGGElement, PedigreeDatasetNode>
) {
	// Add drag behavior to nodes that are not hidden
	node.filter(function (d) {
		return !d.data.hidden;
	}).call(
		drag<SVGGElement, HierarchyPointNode<PedigreeDatasetNode>>()
			.filter(function filter(e: D3DragEvent<SVGElement, HierarchyPointNode<PedigreeDatasetNode>, any>) {
				const event = e.sourceEvent as MouseEvent|undefined;
				return !event?.ctrlKey && !event?.button && !!event?.shiftKey; // Shift + drag
			})
			.on("start", dragstart)
			.on("drag", doDrag)
			.on("end", dragstop)
	);

	// Variables to track drag state
	let xstart: number | undefined;
	let xnew: number | undefined;

	// Drag start handler
	function dragstart(this: SVGElement) {
		const rect = select(this).select<SVGRectElement>('.indi_rect');
		xstart = parseFloat(rect.attr('x') || '0');
	}

	// Drag handler
	function doDrag(this: SVGElement, e: D3DragEvent<SVGElement, HierarchyPointNode<PedigreeDatasetNode>, any>) {
		e.sourceEvent.stopPropagation();

		const dx = e.dx;
		const rect = select(this).select<SVGRectElement>('.indi_rect');
		const currentX = parseFloat(rect.attr('x') || '0');
		xnew = currentX + dx;

		rect.attr('x', xnew);
	}

	// Drag stop handler
	function dragstop(this: SVGElement, _d: HierarchyPointNode<PedigreeDatasetNode>) {
		const me = select<SVGElement, HierarchyPointNode<PedigreeDatasetNode>>(this).datum().data;
		const pnrs = utils.getPartnersNames(opts.dataset || [], me);
		const pnrName = pnrs.length === 1 ? pnrs[0] : -1;

		// Reset the individual's rectangle position
		const rect = select(this).select<SVGRectElement>('.indi_rect');
		if (xstart) {
			rect.attr('x', xstart);
		}

		const isMovingRight = xnew !== undefined && xstart !== undefined && xnew > xstart;

		// Get depth of the node being dragged
		const root = utils.roots[opts.targetDiv];
		const flat_tree = utils.flattenD3(root);
		const meNode = utils.getD3NodeByName(flat_tree, me.name);

		// Nodes at the same depth
		const dnodes = utils.getNodesAtDepth(flat_tree, meNode?.depth || 0, []);

		// Locate adjacent nodes
		let lft_node: typeof dnodes[0] | undefined;
		let rgt_node: typeof dnodes[0] | undefined;
		let adj_node: typeof dnodes[0] | undefined;

		if (xnew !== undefined) {
			xnew += meNode?.x || 0;
		}

		let xlft = -Number.MAX_VALUE;
		let xrgt = Number.MAX_VALUE;

		for (let i = 0; i < dnodes.length; i++) {
			const nodeX = dnodes[i].x || 0
			if (xnew !== undefined) {
				if (nodeX < xnew && nodeX > xlft) {
					lft_node = dnodes[i];
					xlft = nodeX;
				} else if (nodeX > xnew && nodeX < xrgt) {
					rgt_node = dnodes[i];
					xrgt = nodeX;
				}
			}
		}

		if (lft_node === undefined && rgt_node === undefined) return;

		let adjIdx: number | undefined;
		if (isMovingRight) {
			adjIdx = utils.getIdxByName(opts.dataset || [], lft_node!.data.name);
			adj_node = lft_node;
		} else {
			adjIdx = utils.getIdxByName(opts.dataset || [], rgt_node!.data.name);
			adj_node = rgt_node;
		}

		// Move node to new location in the dataset
		const newdataset = utils.copy_dataset(pedcache_current(opts));
		const idx = utils.getIdxByName(opts.dataset || [], me.name);

		elementMove(newdataset, idx, adjIdx);

		if (pnrName !== -1 && adj_node && pnrName !== adj_node.data.name) {
			const partnerIdx = utils.getIdxByName(newdataset, pnrName);
			elementMove(newdataset, partnerIdx, adjIdx);
		}

		opts.dataset = newdataset;

		document.dispatchEvent({type: 'rebuild', detail: opts} as CustomEvent)
	}
}


// move element in array
function elementMove(arr: PedigreeDatasetNode[], oldIndex: number, newIndex: number) {

	const result = [...arr];

	if (newIndex > result.length) {
		newIndex = result.length;
	}

	const element = result.splice(oldIndex, 1)[0];

	result.splice(newIndex, 0, element);

	return result;

	// if (newIndex >= arr.length) {
    //     var k = newIndex - arr.length + 1;
    //     while (k--) {
    //         arr.push(undefined);
    //     }
    // }
    // arr.splice(newIndex, 0, arr.splice(oldIndex, 1)[0]);
    // return arr;
}
