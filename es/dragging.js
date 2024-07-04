import  * as utils from './utils.js';
import {current as pedcache_current} from './pedcache.js';
import {rebuild} from './pedigree.js';


// initialise node dragging - SHIFT + DRAG
export function init_dragging(opts, node) {
	// add drag
	node.filter(function (d) {return !d.data.hidden;})
	    .call(d3.drag()
	    		.filter(function filter(event) { 
					return !event.ctrlKey && !event.button && event.shiftKey; 	// shift and drag
				})
                .on("start", dragstart)
                .on("drag", drag)
                .on("end", dragstop));

	let xstart;
	let xnew;

    function dragstart() {
		xstart = d3.select(this).select('.indi_rect').attr('x');
	}
	
	function drag(e) {
		e.sourceEvent.stopPropagation();
		let dx = e.dx;
 		let indir = d3.select(this).select('.indi_rect');
 		xnew = parseFloat(indir.attr('x'))+ dx;
        indir.attr("x", xnew);
	}
	
	function dragstop(_d) {
		let me = d3.select(this).datum().data;
		let pnrs = utils.get_partners(opts.dataset, me);
		let pnrName = (pnrs.length === 1 ? utils.get_partners(opts.dataset, me)[0] : -1);

		// reset individuals rectangle
		let indir = d3.select(this).select('.indi_rect');
		indir.attr("x", xstart);
		
		console.log("START "+xstart, "END "+xnew);
		
		const isMovingRight = (xnew>xstart);
		
		// get depth of node being dragged
		let root = utils.roots[opts.targetDiv];
		let flat_tree = utils.flatten(root);
		let meNode = utils.getNodeByName(flat_tree, me.name);
		
		// nodes at same depth
		let dnodes = utils.getNodesAtDepth(utils.flatten(root), meNode.depth);
		let lft_node, rgt_node, adj_node;
		xnew += meNode.x;
		let xlft = -Number.MAX_VALUE;
		let xrgt =  Number.MAX_VALUE;
		for(let i=0; i<dnodes.length; i++) {
			console.log(dnodes[i].data.display_name, utils.getIdxByName(opts.dataset, dnodes[i].data.name), 
			            dnodes[i].x, "xnew "+xnew, "xold "+meNode.x, (dnodes[i].x < xnew), (dnodes[i].x > xnew));
			if(dnodes[i].x < xnew && dnodes[i].x > xlft) {
				lft_node = dnodes[i];
				xlft = dnodes[i].x;
			} else if(dnodes[i].x > xnew && dnodes[i].x < xrgt) {
				console.log(i, dnodes[i].x, xrgt);
				rgt_node = dnodes[i];
				xrgt = dnodes[i].x;
			}
		}
		if(lft_node === undefined && rgt_node === undefined) return;
		let adjIdx;
		
		if(isMovingRight) {
			adjIdx = utils.getIdxByName(opts.dataset, lft_node.data.name);
			adj_node = lft_node;
		} else {
			adjIdx = utils.getIdxByName(opts.dataset, rgt_node.data.name);
			adj_node = rgt_node;
		}

		console.log("ADJACENT NODE DISPLAY NAME", adj_node.data.display_name, adjIdx, indir, isMovingRight);

        let newdataset = utils.copy_dataset(pedcache_current(opts));
        let idx = utils.getIdxByName(newdataset, me.name);

        array_move(newdataset, idx, adjIdx);
        if(pnrName !== -1 && pnrName !== adj_node.data.name) {
        	idx = utils.getIdxByName(newdataset, pnrName);
        	array_move(newdataset, idx, adjIdx);
        }

        opts.dataset = newdataset;
        rebuild(opts);
	}
}

function array_move(arr, old_index, new_index) {
    if (new_index >= arr.length) {
        var k = new_index - arr.length + 1;
        while (k--) {
            arr.push(undefined);
        }
    }
    arr.splice(new_index, 0, arr.splice(old_index, 1)[0]);
    return arr;
};
