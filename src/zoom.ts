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
import {Bounds} from "@/models/Types/Bounds.ts";
import {Coordinates} from "@/models/Types/coordinates.ts";
import {Dimensions} from "@/models/Types/dimensions.ts";

let zm: ZoomBehavior<SVGSVGElement, any>;

// initialise zoom and drag
export function init_zoom(opts: Options, svg: Selection<any, PedigreeDatasetNode, HTMLElement, any>) {
	// offsets
	let xi = opts.symbol_size/2;
	let yi = -opts.symbol_size*2.5;

	zm = zoom<SVGSVGElement, PedigreeDatasetNode>()
	  .scaleExtent([opts.zoomIn, opts.zoomOut])
	  .filter(function(e: D3ZoomEvent<SVGSVGElement, PedigreeDatasetNode>) {
		  // console.log('internal zoom filter')
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

export function scale_to_fit(options: Options, alignTop: boolean = false) {
	let dimensions = get_dimensions(options);
	let svg = select<HTMLElement, PedigreeDatasetNode>("#"+options.targetDiv).select<SVGSVGElement>("svg");
	let size = getSvgSize(svg);
	let f = 1;
	let k = (f / Math.max(dimensions.width/size.w, dimensions.height/size.h));

	if(k < options.zoomIn) {
		zm.scaleExtent([k, options.zoomOut]);
	}

	const center = get_pedigree_center(options)


	let translateY = center.y - options.symbol_size
	let translateX = center.x - options.symbol_size
	if (alignTop) {
		const ratio = dimensions.width >= dimensions.height ? dimensions.width / size.w : dimensions.height/size.h
		const newSize = {
			width: dimensions.width / ratio,
			height: dimensions.height / ratio
		}
		const marginTop = ((size.h - newSize.height) / 2)* ratio - options.symbol_size
		translateY = center.y + marginTop
	}

	zoomTo(svg, translateX, translateY, k)
}


export function zoomToSelected(options: Options) {
	let dimensions = get_dimensions(options);
	const svg = select<HTMLElement, PedigreeDatasetNode>("#"+options.targetDiv).select<SVGSVGElement>("svg");
	let size = getSvgSize(svg);
	let f = 1;
	let scale = (f / Math.max(dimensions.width/size.w/1.8, dimensions.height/size.h/1.8));

	if(scale < options.zoomIn) {
		zm.scaleExtent([scale, options.zoomOut]);
	}

	const center = get_pedigree_center(options)

	const selected = svg.selectAll<SVGElement, HierarchyNode<PedigreeDatasetNode>>(".node")
		.filter((node) => !!node.data.isUiSelected)

	if (!selected.data().length) {
		// No selected node found
		return
	}


	const node = selected.data()[0]
	const nodeY = node.y || center.y
	const nodeX = node.x || center.x

	let translateY = nodeY - options.symbol_size
	let translateX = nodeX - options.symbol_size

	zoomTo(svg, translateX, translateY, 1.01)
}

export function zoomTo(svg: Selection<SVGSVGElement, PedigreeDatasetNode, HTMLElement, any>, x: number, y: number, scale?: number) {
	console.log('translateTo', x, y, zm)
	svg.call(zm.translateTo, x, y);
	if (scale) {
		console.log('scaleTo', scale)
		svg.call(zm.scaleTo, scale)
	}
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

function get_pedigree_center(opts: Options): Coordinates {
	const bounds = get_bounds(opts)
	return {
		x: bounds.xmin+((bounds.xmax-bounds.xmin)/2),
		y: bounds.ymin+((bounds.ymax-bounds.ymin)/2)
	};
}

// find width/height of pedigree graphic
export function get_dimensions(opts: Options): Dimensions {
	let bounds = get_bounds(opts);
	return {
		width: Math.abs(bounds.xmax-bounds.xmin),
		height: Math.abs(bounds.ymax-bounds.ymin)
	};
}

/**
 * Get the min/max boundary of the diagram
 */
export function get_bounds(opts: Options): Bounds {
	let ped = select<HTMLElement, PedigreeDatasetNode>("#"+opts.targetDiv).select(".diagram");
	let xmin = Number.MAX_VALUE;
	let xmax = -1000000;
	let ymin = Number.MAX_VALUE;
	let ymax = -1000000;
	let symbolSize = opts.symbol_size;
	ped.selectAll<SVGGElement, HierarchyNode<PedigreeDatasetNode>>('g').each(function(d, i, element) {
		if(d.x && d.data.name !== 'hidden_root' && !d.data.hidden) {
			let n = getNodeSize(opts, element[i], symbolSize);
			if(d.x - symbolSize < xmin) {
				xmin = d.x-symbolSize;
			}

			if(d.x + n.w + symbolSize > xmax) {
				xmax = d.x + n.w + symbolSize;
			}
			const dY = d.y || 0

			if(dY < ymin) {
				ymin = d.y || 0;
			}

			if(dY + n.h + symbolSize > ymax) {
				ymax = dY + n.h + symbolSize;
			}
		}
	});

	return {xmin, xmax, ymin, ymax};
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
