/**
/* © 2023 University of Cambridge
/* SPDX-FileCopyrightText: 2023 University of Cambridge
/* SPDX-License-Identifier: GPL-3.0-or-later
**/

import {getPosition, setposition} from './pedcache.ts';
import {Options} from "@/models/Options.ts";
import {D3ZoomEvent, HierarchyNode, select, Selection, zoom, zoomIdentity} from "d3";
import {PedigreeDatasetNode} from "@/models/PedigreeDatasetNode.ts";
import {ZoomBehavior} from "d3-zoom";

let zm: ZoomBehavior<SVGSVGElement, any>;

// initialise zoom and drag
export function init_zoom(opts: Options, svg: Selection<any, PedigreeDatasetNode, HTMLElement, any>) {
	// offsets
	let xi = opts.symbol_size/2;
	let yi = -opts.symbol_size*2.5;

	zm = zoom<SVGSVGElement, PedigreeDatasetNode>()
	  .scaleExtent([opts.zoomIn, opts.zoomOut])
	  .filter(function(e: D3ZoomEvent<SVGSVGElement, PedigreeDatasetNode>) {
			if(!opts.zoomSrc || opts.zoomSrc.indexOf('wheel') === -1) {
				if(e.type && e.type === 'wheel') return false
			}
			// ignore dblclick & secondary mouse buttons
			return (e.type !== 'dblclick')
	  })
	  .on('zoom', function(e: D3ZoomEvent<SVGSVGElement, PedigreeDatasetNode>) { zooming(e, opts); });
	svg.call(zm);

	// set initial position & scale
	let xyk = getPosition(opts);		// cached position
	let k = (xyk.length === 3 && xyk[2] !== null ? xyk[2] : 1);
	let x = (xyk[0] !== null ? xyk[0]/k: (xi*k));
	let y = (xyk[1] !== null ? xyk[1]/k: (yi*k));

	var transform = zoomIdentity
      .scale(k)
      .translate(x, y);
    svg.call(zm.transform, transform);
}

// scale size the pedigree
export function btn_zoom(opts: Options, scale: number) {
	let svg = select("#"+opts.targetDiv).select<SVGSVGElement>("svg");
	svg.transition().duration(50).call(zm.scaleBy, scale);
}

export function scale_to_fit(opts: Options) {
	let d = get_dimensions(opts);
	let svg = select<HTMLElement, PedigreeDatasetNode>("#"+opts.targetDiv).select<SVGSVGElement>("svg");
	let size = getSvgSize(svg);
	let f = 1;
	let k = (f / Math.max(d.width/size.w, d.height/size.h));

	if(k < opts.zoomIn) zm.scaleExtent([k, opts.zoomOut]);

	let ped = get_pedigree_center(opts);
	svg.call(zm.translateTo, ped.x-(opts.symbol_size), ped.y-(opts.symbol_size));
	setTimeout(function(){svg.transition().duration(700).call(zm.scaleTo, k)}, 400);
}

function zooming(e: D3ZoomEvent<SVGSVGElement, PedigreeDatasetNode>, opts: Options) {
	(opts.DEBUG && console.log("zoom", e.transform));
	let t = e.transform;
	let k = (t.k && t.k !== 1 ? t.k : undefined);
	if (k !== undefined) {
		setposition(opts, t.x, t.y, k);
		let ped = select("#" + opts.targetDiv).select(".diagram");
		ped.attr('transform', 'translate(' + t.x + ',' + t.y + ')' + (k ? ' scale(' + k + ')' : ''));
	}
}

function get_pedigree_center(opts: Options) {
	let b = get_bounds(opts);
	return {x: b.xmin+((b.xmax-b.xmin)/2), y: b.ymin+((b.ymax-b.ymin)/2)};
}

// find width/height of pedigree graphic
function get_dimensions(opts: Options) {
	let b = get_bounds(opts);
	return {width: Math.abs(b.xmax-b.xmin), height: Math.abs(b.ymax-b.ymin)};
}

/**
 * Get the min/max boundary of the diagram
 */
export function get_bounds(opts: Options) {
	let ped = select<HTMLElement, PedigreeDatasetNode>("#"+opts.targetDiv).select(".diagram");
	let xmin = Number.MAX_VALUE;
	let xmax = -1000000;
	let ymin = Number.MAX_VALUE;
	let ymax = -1000000;
	let sym = opts.symbol_size;
	ped.selectAll<SVGGElement, HierarchyNode<PedigreeDatasetNode>>('g').each(function(d, i, element) {
		if(d.x && d.data.name !== 'hidden_root' && !d.data.hidden) {
			let n = getNodeSize(opts, element[i], sym);
			if(d.x - sym < xmin) {
				xmin = d.x-sym;
			}

			if(d.x + n.w + sym > xmax) {
				xmax = d.x + n.w + sym;
			}
			const dY = d.y || 0

			if(dY < ymin) {
				ymin = d.y || 0;
			}

			if(dY + n.h + sym > ymax) {
				ymax = dY + n.h + sym;
			}
		}
	});
	return {xmin:xmin, xmax:xmax, ymin:ymin, ymax:ymax};
}

/**
 * Get the size of an individual's graphical representation
 */
function getNodeSize(opts: Options, g_elm: SVGGElement, sym: number) {
	let node = select<SVGGElement, PedigreeDatasetNode>(g_elm).node();
	let dg = node?.getBBox();
	let w = dg?.width || 0;
	let h = dg?.height || 0;
	if(w === 0 && h === 0) {	// pedigree not shown yet (family history section not opened)
		try {
			w = sym*2;
			h = sym*2;

			let text_elements = select<SVGGElement, PedigreeDatasetNode>(g_elm).selectAll<SVGElement, PedigreeDatasetNode>(".indi_details");
			let elements = text_elements.nodes();

			for (let i = 0; i < elements.length; i++) {
				let txt = elements[i].firstChild?.nodeValue;

				let textSize = getTextSize(txt || '', opts.font_family, opts.font_size);
	
				w = Math.max(textSize.w+(sym/2), w);
				h = Math.max((sym*2)+(i*textSize.h), h);
			}
		} catch(err) {
			console.error(err);
			w = sym*2;
			h = sym*2;
		}
	}
	return {w:w, h:h};
}

/**
 * Calculate width and height of text
 */
function getTextSize(txt: string, font: string, fontSize: string) {
	let divElement = document.createElement('div')
	divElement.innerText = txt
	divElement.style.position = 'absolute'
	divElement.style.float = 'left'
	divElement.style.whiteSpace = 'nowrap'
	divElement.style.visibility = 'hidden'
	divElement.style.font = font || 'Helvetica'
	divElement.style.fontSize = fontSize || '1em'
	document.querySelector('body')?.appendChild(divElement)

	let s = {w: divElement.clientWidth, h:divElement.clientHeight};
	divElement.remove();

	return s;
}

function getSvgSize(svg: Selection<SVGSVGElement, PedigreeDatasetNode, HTMLElement, any>) {
	return {
		w: svg.node()?.clientWidth || 0,
		h: svg.node()?.clientHeight || 0
	}
}
