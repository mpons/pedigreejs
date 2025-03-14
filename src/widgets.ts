/**
/* © 2023 University of Cambridge
/* SPDX-FileCopyrightText: 2023 University of Cambridge
/* SPDX-License-Identifier: GPL-3.0-or-later
**/
// pedigree widgets
import { save } from './popup_form.ts';
import { current as pedcache_current } from './pedcache.ts';
import { getUniqueTwinID, setMzTwin, checkTwins } from './twins.ts';
import { Options } from "@/models/Options";
import {HierarchyPointNode, select, selectAll, drag, pointer, Selection, HierarchyNode} from "d3";
import { PedigreeDatasetNode } from "@/models/PedigreeDatasetNode";
import {Sex} from "@/models/Types/Sex.ts";
import {
	copy_dataset,
	flattenD3,
	getAdoptedSiblings,
	getAllChildren,
	getAllSiblings, getD3NodeByName, getDepth,
	getIdxByName,
	getName,
	getNodesAtDepth,
	getPartners, getPedigreeNodeByName,
	makeid, messages,
	roots, unconnected, validatePedigree
} from "./utils.ts";

let dragging: HierarchyNode<PedigreeDatasetNode> | undefined;
let last_mouseover: HierarchyNode<PedigreeDatasetNode> | undefined;

//
// Add widgets to nodes and bind events
export function addWidgets(opts: Options, node: Selection<Element, HierarchyNode<PedigreeDatasetNode>, HTMLElement, any>) {
	// Popup gender selection box
	const fontSize = parseInt(getComputedStyle(document.body).fontSize || '14');
	const popupSelection = select('.diagram');
	popupSelection
		.append("rect")
		.attr("class", "popup_selection")
		.attr("rx", 6)
		.attr("ry", 6)
		.attr("transform", "translate(-1000,-100)")
		.style("opacity", 0)
		.attr("width", fontSize * 7.9)
		.attr("height", fontSize * 2)
		.style("stroke", "darkgrey")
		.attr("fill", "white");

	const square = popupSelection
		.append("text") // male
		.attr('font-family', 'FontAwesome')
		.style("opacity", 0)
		.style("font-size", "1.1em")
		.attr("class", "popup_selection fa-square persontype")
		.attr("transform", "translate(-1000,-100)")
		.attr("x", fontSize / 3)
		.attr("y", fontSize * 1.5)
		.text("\uf096 ");
	square.append("svg:title").text("add male");

	const circle = popupSelection
		.append("text") // female
		.attr('font-family', 'FontAwesome')
		.style("opacity", 0)
		.style("font-size", "1.1em")
		.attr("class", "popup_selection fa-circle persontype")
		.attr("transform", "translate(-1000,-100)")
		.attr("x", fontSize * 1.71)
		.attr("y", fontSize * 1.5)
		.text("\uf10c ");
	circle.append("svg:title").text("add female");

	const unspecified = popupSelection
		.append("text") // unspecified
		.attr('font-family', 'FontAwesome')
		.style("opacity", 0)
		.style("font-size", "1.1em")
		.attr("transform", "translate(-1000,-100)")
		.attr("x", fontSize * 0.065)
		.attr("y", -fontSize * 0.065)
		.attr("class", "popup_selection fa-unspecified popup_selection_rotate45 persontype")
		.text("\uf096 ");
	unspecified.append("svg:title").text("add unspecified");

	const dztwin = popupSelection
		.append("text") // dizygotic twins
		.attr('font-family', 'FontAwesome')
		.style("opacity", 0)
		.style("font-size", "1.6em")
		.attr("transform", "translate(-1000,-100)")
		.attr("class", "popup_selection fa-angle-up persontype dztwin")
		.attr("x", fontSize * 4.62)
		.attr("y", fontSize * 1.5)
		.text("\uf106 ");
	dztwin.append("svg:title").text("add dizygotic/fraternal twins");

	const mztwin = popupSelection
		.append("text") // monozygotic twins
		.attr('font-family', 'FontAwesome')
		.style("opacity", 0)
		.style("font-size", "1.6em")
		.attr("transform", "translate(-1000,-100)")
		.attr("class", "popup_selection fa-caret-up persontype mztwin")
		.attr("x", fontSize * 6.4)
		.attr("y", fontSize * 1.5)
		.text("\uf0d8 ");
	mztwin.append("svg:title").text("add monozygotic/identical twins");

	let add_person: { node?: Selection<Element, HierarchyNode<PedigreeDatasetNode>, null, undefined>; type?: string } = {};

	// Click the person type selection
	selectAll<SVGTextElement, unknown>(".persontype")
		.on("click", function () {
			const newdataset = copy_dataset(pedcache_current(opts));
			const isMztwin = select(this).classed("mztwin");
			const isDztwin = select(this).classed("dztwin");
			let twinType: 'mztwin' | 'dztwin' | undefined;
			let sex: Sex;

			if (isMztwin || isDztwin) {
				sex = add_person.node?.datum().data.sex || 'U';
				twinType = isMztwin ? "mztwin" : "dztwin";
			} else {
				sex = select(this).classed("fa-square") ? 'M' : (select(this).classed("fa-circle") ? 'F' : 'U');
			}

			if (add_person.type === 'addsibling' && add_person.node !== undefined) {
				addSibling(newdataset, add_person.node.datum().data, sex, false, twinType);
			} else if (add_person.type === 'addchild' && add_person.node !== undefined) {
				addChild(newdataset, add_person.node.datum().data, twinType ? 'U' : sex, twinType ? 2 : 1, twinType);
			} else {
				return;
			}

			opts.dataset = newdataset;
			if (opts.onChange) {
				opts.onChange(opts.dataset || []);
			}

			document.dispatchEvent(new CustomEvent('rebuild', { detail: opts }));
			selectAll('.popup_selection').style("opacity", 0);
			add_person = {};
		})
		.on("mouseover", function () {
			if (add_person.node) {
				add_person.node.select('rect').style("opacity", 0.2);
			}
			selectAll('.popup_selection').style("opacity", 1);

			// Add tooltips to FontAwesome widgets
			if (add_person.type === 'addsibling') {
				if (select(this).classed("fa-square")) {
					square.select("title").text("add brother");
				} else {
					circle.select("title").text("add sister");
				}
			} else if (add_person.type === 'addchild') {
				if (select(this).classed("fa-square")) {
					square.select("title").text("add son");
				} else {
					circle.select("title").text("add daughter");
				}
			}
		});

	// Handle mouse out of popup selection
	selectAll(".popup_selection").on("mouseout", function () {
		if (add_person.node && highlight.indexOf(add_person.node.datum()) === -1) {
			add_person.node.select('rect').style("opacity", 0);
		}
		selectAll('.popup_selection').style("opacity", 0);
	});

	// Drag line between nodes to create partners
	drag_handle(opts);

	// Rectangle used to highlight on mouse over
	node.filter(function (d) {
		return !(d.data.hidden && !opts.DEBUG);
	})
		.append("rect")
		.attr("class", 'indi_rect')
		.attr("rx", 6)
		.attr("ry", 6)
		.attr("x", function () { return -0.75 * opts.symbol_size; })
		.attr("y", function () { return -opts.symbol_size; })
		.attr("width", (1.5 * opts.symbol_size) + 'px')
		.attr("height", (2 * opts.symbol_size) + 'px')
		.style("stroke", "black")
		.style("stroke-width", 0.7)
		.style("opacity", 0)
		.attr("fill", "lightgrey");

	// Widgets
	const fx = function () { return off - (0.75 * opts.symbol_size); };
	const fy = opts.symbol_size - 2;
	let off = 0;
	const widgets: Record<string, any> = {
		addchild: { 'text': '\uf063', 'title': 'add child', 'fx': fx, 'fy': fy },
		addsibling: { 'text': '\uf234', 'title': 'add sibling', 'fx': fx, 'fy': fy },
		addpartner: { 'text': '\uf0c1', 'title': 'add partner', 'fx': fx, 'fy': fy },
		addparents: {
			'text': '\uf062', 'title': 'add parents',
			'fx': -0.75 * opts.symbol_size,
			'fy': -opts.symbol_size + 11
		},
		delete: {
			'text': 'X', 'title': 'delete',
			'fx': (opts.symbol_size / 2) - 1,
			'fy': -opts.symbol_size + 12,
			'styles': { "font-weight": "bold", "fill": "darkred", "font-family": "monospace" }
		},
		settings: {}
	};

	if (opts.edit) {
		widgets.settings = { 'text': '\uf013', 'title': 'settings', 'fx': (-fontSize / 2) + 2, 'fy': -opts.symbol_size + 11 };
	}

	for (const key in widgets) {
		const widget = node.filter(function (d) {
			return (d.data.hidden && !opts.DEBUG ? false : true) &&
				!((d.data.mother === undefined || d.data.noparents) && key === 'addsibling') &&
				!(d.data.parent_node !== undefined && d.data.parent_node.length > 1 && key === 'addpartner') &&
				!(d.data.parent_node === undefined && key === 'addchild') &&
				!((d.data.noparents === undefined && d.data.top_level === undefined) && key === 'addparents');
		})
			.append("text")
			.attr("class", key)
			.style("opacity", 0)
			.attr('font-family', 'FontAwesome')
			.attr("xx", function (d) { return d.x || 0; })
			.attr("yy", function (d) { return d.y || 0; })
			.attr("x", widgets[key].fx)
			.attr("y", widgets[key].fy)
			.attr('font-size', '0.85em')
			.text(widgets[key].text);

		if ('styles' in widgets[key]) {
			for (const style in widgets[key].styles) {
				widget.attr(style, widgets[key].styles[style]);
			}
		}

		widget.append("svg:title").text(widgets[key].title);
		off += 17;
	}

	// Add sibling or child
	selectAll<Element, HierarchyNode<PedigreeDatasetNode>>(".addsibling, .addchild")
		.on("mouseover", function (this: Element) {
			const type = select(this).attr('class') || '';
			selectAll('.popup_selection').style("opacity", 1);

			if (this.parentNode) {
				add_person = {
					node: select(this.parentNode as Element),
					type: type
				};
			}

			const xx = select(this).attr("xx");
			const x_attr = select(this).attr("x");
			const yy = select(this).attr("yy");
			const y_attr = select(this).attr("y");

			const x = parseInt(xx || "0") + parseInt(x_attr || "0");
			const y = parseInt(yy || "0") + parseInt(y_attr || "0");

			selectAll('.popup_selection').attr("transform", `translate(${x},${y + 2})`);
			selectAll('.popup_selection_rotate45')
				.attr("transform", `translate(${x + (3 * fontSize)},${y + (fontSize * 1.2)}) rotate(45)`);
		});

	// Handle widget clicks
	selectAll<Element, HierarchyNode<PedigreeDatasetNode>>(".addchild, .addpartner, .addparents, .delete, .settings")
		.on("click", function (this: Element, e) {
			e.stopPropagation();
			const opt = select(this).attr('class');
			if (!this.parentNode) {
				return
			}
			const d = select<Element, HierarchyNode<PedigreeDatasetNode>>(this.parentNode as Element).datum();
			if (opts.DEBUG) {
				console.log(opt);
			}

			let newdataset;
			if (opt === 'settings') {
				if (typeof opts.edit === 'function') {
					opts.edit(opts, d);
				} else {
					openEditDialog(opts, d);
				}
			} else if (opt === 'delete') {
				newdataset = copy_dataset(pedcache_current(opts));
				delete_node_dataset(newdataset, d.data, opts, onDone);
			} else if (opt === 'addparents') {
				newdataset = copy_dataset(pedcache_current(opts));
				opts.dataset = newdataset;
				addParents(opts, newdataset, d.data.name);
				document.dispatchEvent(new CustomEvent('rebuild', { detail: opts }));
			} else if (opt === 'addpartner') {
				newdataset = copy_dataset(pedcache_current(opts));
				addPartner(opts, newdataset, d.data.name);
				opts.dataset = newdataset;
				document.dispatchEvent(new CustomEvent('rebuild', { detail: opts }));
			}
			// Trigger fhChange event
			document.dispatchEvent(new CustomEvent('fhChange', { detail: opts }));
		});

	// Other mouse events
	let highlight: HierarchyNode<PedigreeDatasetNode>[] = [];

	node.filter(function (d) { return !d.data.hidden; })
		.on("click", function (e, d) {
			if (e.ctrlKey) {
				if (highlight.indexOf(d) === -1) {
					highlight.push(d);
				} else {
					highlight.splice(highlight.indexOf(d), 1);
				}
			} else {
				highlight = [d];
			}

			if ('nodeClick' in opts && opts.nodeClick !== undefined) {
				opts.nodeClick(d.data);
				selectAll(".indi_rect").style("opacity", 0);
				selectAll<SVGGElement, HierarchyNode<PedigreeDatasetNode>>('.indi_rect').filter(function (d: HierarchyNode<PedigreeDatasetNode>) { return highlight.indexOf(d) !== -1; }).style("opacity", 0.5);
			}
		})
		.on("mouseover", function (e, d) {
			e.stopPropagation();
			last_mouseover = d;
			if (dragging && last_mouseover) {
				if (dragging.data.name !== last_mouseover.data.name &&
					dragging.data.sex !== last_mouseover.data.sex) {
					select(this).select('rect').style("opacity", 0.2);
				}
				return;
			}
			select(this).select('rect').style("opacity", 0.2);
			select(this).selectAll('.addchild, .addsibling, .addpartner, .addparents, .delete, .settings').style("opacity", 1);
			select(this).selectAll('.indi_details').style("opacity", 0);

			setLineDragPosition(opts.symbol_size - 10, 0, opts.symbol_size - 2, 0, `${d.x},${(d.y||0) + 2}`);
		})
		.on("mouseout", function (d) {
			if (dragging) return;

			select(this).selectAll('.addchild, .addsibling, .addpartner, .addparents, .delete, .settings').style("opacity", 0);
			if (highlight.indexOf(d) === -1) {
				select(this).select('rect').style("opacity", 0);
			}
			select(this).selectAll('.indi_details').style("opacity", 1);
			// Hide popup if it looks like the mouse is moving north
			const [xcoord, ycoord] = pointer(d);
			if (ycoord < 0.8 * opts.symbol_size) {
				selectAll('.popup_selection').style("opacity", 0);
			}
			if (!dragging) {
				// Hide popup if it looks like the mouse is moving north, south, or west
				if (Math.abs(ycoord) > 0.25 * opts.symbol_size ||
					Math.abs(ycoord) < -0.25 * opts.symbol_size ||
					xcoord < 0.2 * opts.symbol_size) {
					setLineDragPosition(0, 0, 0, 0);
				}
			}
		});
}

function onDone(opts: Options, dataset?: PedigreeDatasetNode[]) {
	// Assign new dataset and rebuild pedigree
	if (dataset) {
		opts.dataset = dataset
	}
	opts.onDone?.(dataset || []);

	document.dispatchEvent(new CustomEvent('rebuild', { detail: opts }));
}

// Drag line between nodes to create partners
function drag_handle(opts: Options) {
	const lineDragSelection = select<SVGLineElement, HierarchyPointNode<PedigreeDatasetNode>>('.diagram');
	const dline = lineDragSelection.append("line").attr("class", 'line_drag_selection')
		.attr("stroke-width", 6)
		.style("stroke-dasharray", ("2, 1"))
		.attr("stroke", "black")
		.call(drag<SVGLineElement, HierarchyPointNode<PedigreeDatasetNode>>()
			.on("start", dragStart)
			.on("drag", onDrag)
			.on("end", dragStop));
	dline.append("svg:title").text("drag to create consanguineous partners");

	setLineDragPosition(0, 0, 0, 0);

	function dragStart(this: SVGLineElement) {
		dragging = last_mouseover;
		selectAll('.line_drag_selection')
			.attr("stroke", "darkred");
	}

	function dragStop(this: SVGLineElement) {
		if (last_mouseover &&
			dragging!.data.name !== last_mouseover.data.name &&
			dragging!.data.sex !== last_mouseover.data.sex) {
			// Make partners
			const child: PedigreeDatasetNode = {
				famid: dragging!.data.famid,
				display_name: '',
				proband: false,
				name: makeid(4),
				sex: 'U',
				mother: (dragging!.data.sex === 'F' ? dragging!.data.name : last_mouseover.data.name),
				father: (dragging!.data.sex === 'F' ? last_mouseover.data.name : dragging!.data.name),
				ashkenazi: false,
				parent: null,
				status: "0"
			};

			const newdataset = copy_dataset(opts.dataset || []);
			opts.dataset = newdataset;

			const idx = getIdxByName(opts.dataset, dragging!.data.name) + 1;
			opts.dataset.splice(idx, 0, child);
			document.dispatchEvent(new CustomEvent('rebuild', { detail: opts }));
		}
		setLineDragPosition(0, 0, 0, 0);
		selectAll('.line_drag_selection')
			.attr("stroke", "black");
		dragging = undefined;
		return;
	}

	function onDrag(this: SVGLineElement, e: d3.D3DragEvent<SVGLineElement, HierarchyPointNode<PedigreeDatasetNode>, unknown>) {
		e.sourceEvent.stopPropagation();
		const dx = e.dx;
		const dy = e.dy;
		const xnew = parseFloat(select(this).attr('x2')!) + dx;
		const ynew = parseFloat(select(this).attr('y2')!) + dy;
		setLineDragPosition(opts.symbol_size - 10, 0, xnew, ynew);
	}
}

/**
 * Set the position and start and end of consanguineous widget.
 */
function setLineDragPosition(x1: number, y1: number, x2: number, y2: number, translate?: string) {
	if (translate) {
		selectAll('.line_drag_selection').attr("transform", `translate(${translate})`);
	}
	selectAll('.line_drag_selection')
		.attr("x1", x1)
		.attr("y1", y1)
		.attr("x2", x2)
		.attr("y2", y2);
}

// If opt.edit is set true (rather than given a function) this is called to edit node attributes
function openEditDialog(opts: Options, d: any) {
	if (opts.onEdit) {
		opts.onEdit(d.data.name);
	}

	const nodeProperties = document.getElementById('node_properties');
	if (!nodeProperties) return;

	nodeProperties.innerHTML = ''; // Clear existing content

	const table = document.createElement('table');
	table.id = 'person_details';
	table.classList.add('table');

	const createRow = (label: string, input: HTMLInputElement | HTMLSelectElement) => {
		const row = document.createElement('tr');
		const labelCell = document.createElement('td');
		labelCell.style.textAlign = 'right';
		labelCell.textContent = label;

		const inputCell = document.createElement('td');
		inputCell.appendChild(input);

		row.appendChild(labelCell);
		row.appendChild(inputCell);
		return row;
	};

	// Unique ID
	const idInput = document.createElement('input');
	idInput.classList.add('form-control');
	idInput.type = 'text';
	idInput.id = 'id_name';
	idInput.name = 'name';
	idInput.value = d.data.name || '';
	table.appendChild(createRow('Unique ID', idInput));

	// Name
	const nameInput = document.createElement('input');
	nameInput.classList.add('form-control');
	nameInput.type = 'text';
	nameInput.id = 'id_display_name';
	nameInput.name = 'display_name';
	nameInput.value = d.data.display_name || '';
	table.appendChild(createRow('Name', nameInput));

	// Age
	const ageInput = document.createElement('input');
	ageInput.classList.add('form-control');
	ageInput.type = 'number';
	ageInput.id = 'id_age';
	ageInput.name = 'age';
	ageInput.min = '0';
	ageInput.max = '120';
	ageInput.style.width = '7em';
	ageInput.value = d.data.age || '';
	table.appendChild(createRow('Age', ageInput));

	// Year of Birth
	const yobInput = document.createElement('input');
	yobInput.classList.add('form-control');
	yobInput.type = 'number';
	yobInput.id = 'id_yob';
	yobInput.name = 'yob';
	yobInput.min = '1900';
	yobInput.max = '2050';
	yobInput.style.width = '7em';
	yobInput.value = d.data.yob || '';
	table.appendChild(createRow('Year Of Birth', yobInput));

	// Sex
	const sexRow = document.createElement('tr');
	const sexLabelCell = document.createElement('td');
	sexLabelCell.colSpan = 2;
	sexLabelCell.id = 'id_sex';

	['M', 'F', 'U'].forEach((value) => {
		const label = document.createElement('label');
		label.classList.add('radio-inline');

		const radio = document.createElement('input');
		radio.type = 'radio';
		radio.name = 'sex';
		radio.value = value;
		if (d.data.sex === value) {
			radio.checked = true;
		}

		label.appendChild(radio);
		label.appendChild(document.createTextNode(value === 'M' ? 'Male' : value === 'F' ? 'Female' : 'Unknown'));
		sexLabelCell.appendChild(label);
	});

	sexRow.appendChild(sexLabelCell);
	table.appendChild(sexRow);

	// Alive/Deceased Status
	const statusRow = document.createElement('tr');
	const statusLabelCell = document.createElement('td');
	statusLabelCell.colSpan = 2;
	statusLabelCell.id = 'id_status';

	['0', '1'].forEach((value) => {
		const label = document.createElement('label');
		label.classList.add('checkbox-inline');

		const radio = document.createElement('input');
		radio.type = 'radio';
		radio.name = 'status';
		radio.value = value;
		if (parseInt(d.data.status) === parseInt(value)) {
			radio.checked = true;
		}

		label.appendChild(radio);
		label.appendChild(document.createTextNode(value === '0' ? 'Alive' : 'Deceased'));
		statusLabelCell.appendChild(label);
	});

	statusRow.appendChild(statusLabelCell);
	table.appendChild(statusRow);

	// Append table to dialog
	nodeProperties.appendChild(table);

	// Add event listeners for input changes
	nodeProperties.querySelectorAll('input, select').forEach((input) => {
		input.addEventListener('change', () => save(opts));
	});

	// Open dialog
	const dialog = nodeProperties as HTMLDialogElement;
	if (dialog.showModal) {
		dialog.showModal();
	} else {
		console.warn('Dialog API not supported in this browser.');
	}
}

// add children to a given node
export function addChild(dataset: PedigreeDatasetNode[], node: PedigreeDatasetNode, sex: Sex, nchild?: number, twinType?: 'mztwin'|'dztwin'): any[] | Error {
	if (twinType && !["mztwin", "dztwin"].includes(twinType))
		return new Error("INVALID TWIN TYPE SET: " + twinType);

	if (typeof nchild === "undefined") {
		nchild = 1;
	}
	let children = getAllChildren(dataset, node);
	let ptr_name: string;
	let idx: number;
	if (children.length === 0) {
		let partner = addSibling(dataset, node, node.sex === 'F' ? 'M' : 'F', node.sex === 'F');
		if (partner instanceof Error) return partner;
		partner.noparents = true;
		ptr_name = partner.name;
		idx = getIdxByName(dataset, node.name) + 1;
	} else {
		let c = children[0];
		ptr_name = (getName(c.father) === node.name ? getName(c.mother) : getName(c.father));
		idx = getIdxByName(dataset, c.name);
	}

	let twin_id: string | undefined;
	if (twinType) {
		twin_id = getUniqueTwinID(dataset, twinType);
	}
	let newChildren: any[] = [];
	for (let i = 0; i < nchild; i++) {
		const child: PedigreeDatasetNode = {
			famid: node.famid,
			display_name: '',
			proband: false,
			name: makeid(4),
			sex: sex as Sex,
			mother: (node.sex === 'F' ? node.name : ptr_name),
			father: (node.sex === 'F' ? ptr_name : node.name),
			ashkenazi: false,
			parent: null,
			status: "0"
		};

		dataset.splice(idx, 0, child);

		if (twinType && twin_id) {
			child[twinType] = twin_id;
		}
		newChildren.push(child);
	}
	return newChildren;
}

// add sibling
export function addSibling(dataset: PedigreeDatasetNode[], node: PedigreeDatasetNode, sex: Sex, addLhs?: boolean, twinType?: 'mztwin'|'dztwin'): any | Error {
	if (twinType && !["mztwin", "dztwin"].includes(twinType))
		return new Error("INVALID TWIN TYPE SET: " + twinType);

	let newSibling: PedigreeDatasetNode = {
		famid: node.famid,
		name: makeid(4),
		display_name: '',
		sex: sex,
		proband: false,
		ashkenazi: false,
		status: '0',
		parent: null
	};

	if (node.top_level) {
		newSibling.top_level = true;
	} else {
		newSibling.mother = node.mother;
		newSibling.father = node.father;
	}

	let idx = getIdxByName(dataset, node.name);

	if (twinType) {
		setMzTwin(dataset, dataset[idx], newSibling, twinType);
	}

	if (addLhs) { // add to LHS
		if (idx > 0) {
			idx--;
		}
	} else {
		idx++;
	}

	dataset.splice(idx, 0, newSibling);

	return newSibling;
}

// add parents to the 'node'
export function addParents(opts: Options, dataset: PedigreeDatasetNode[], name: string): void {
	let mother: PedigreeDatasetNode;
	let father: PedigreeDatasetNode;
	let root = roots[opts.targetDiv];
	let flatTree = flattenD3(root);
	let treeNode = getD3NodeByName(flatTree, name);
	if (!treeNode || !treeNode.data.id) {
		return;
	}

	let node = treeNode.data;
	let depth = treeNode.depth;   // depth of the node in relation to the root (depth = 1 is a top_level node)

	let pid = -101;
	let partnerName: string | undefined;
	let children = getAllChildren(dataset, node);
	if (children.length > 0) {
		partnerName = getName(children[0].mother) === node.name ? getName(children[0].father) : getName(children[0].mother);
		pid = getD3NodeByName(flatTree, partnerName)?.data.id || -101;
	}

	let i: number;
	if (depth === 1) {
		mother = {
			famid: node.famid,
			name: makeid(4),
			display_name: '',
			sex: 'F',
			proband: false,
			ashkenazi: false,
			status: '0',
			parent: null,
			top_level: true
		}
		father = {
			famid: node.famid,
			name: makeid(4),
			display_name: '',
			sex: 'M',
			proband: false,
			ashkenazi: false,
			status: '0',
			parent: null,
			top_level: true
		}

		dataset.splice(0, 0, mother);
		dataset.splice(0, 0, father);

		for (i = 0; i < dataset.length; i++) {
			if ((dataset[i].top_level || getDepth(dataset, dataset[i].name) === 2) &&
				dataset[i].name !== mother.name && dataset[i].name !== father.name) {
				delete dataset[i].top_level;
				dataset[i].noparents = true;
				dataset[i].mother = mother.name;
				dataset[i].father = father.name;
			}
		}
	} else {
		let node_mother = getD3NodeByName(flatTree, getName(treeNode.data.mother));
		let node_father = getD3NodeByName(flatTree, getName(treeNode.data.father));
		let siblingNodes = getAllSiblings(dataset, node);

		// lhs & rhs id's for siblings of this node
		let rid = 10000;
		let lid = treeNode.data.id;
		for (i = 0; i < siblingNodes.length; i++) {
			let siblingId = getD3NodeByName(flatTree, getName(siblingNodes[i]))?.data.id || 0;
			if (siblingId < rid && siblingId > lid) {
				rid = siblingId;
			}
			if (siblingId < lid) {
				lid = siblingId;
			}
		}
		let add_lhs = (lid >= treeNode.data.id || (pid === lid && rid < 10000));

		if (opts.DEBUG) {
			console.log('lid=' + lid + ' rid=' + rid + ' nid=' + treeNode.data.id + ' ADD_LHS=' + add_lhs);
		}

		let midx = getIdxByName(dataset, getName(node.mother))
		if (node_father?.data.id !== undefined && node_mother?.data.id !== undefined &&
			((!add_lhs && node_father.data.id > node_mother.data.id) || (add_lhs && node_father.data.id < node_mother.data.id))
		) {
			midx = getIdxByName(dataset, getName(node.father));
		}

		let parent = dataset[midx];
		father = addSibling(dataset, parent, 'M', add_lhs);
		if (father instanceof Error) return;
		mother = addSibling(dataset, parent, 'F', add_lhs);
		if (mother instanceof Error) return;

		let faidx = getIdxByName(dataset, father.name);
		let moidx = getIdxByName(dataset, mother.name);
		if (faidx > moidx) {                   // switch to ensure father on lhs of mother
			let tmpfa = dataset[faidx];
			dataset[faidx] = dataset[moidx];
			dataset[moidx] = tmpfa;
		}

		let orphans = getAdoptedSiblings(dataset, node);
		let nid = treeNode.data.id;
		for (i = 0; i < orphans.length; i++) {
			let orphanId = getD3NodeByName(flatTree, getName(orphans[i].name))?.data.id;
			if (!orphanId) {
				continue
			}

			if (opts.DEBUG) {
				console.log('ORPHAN=' + i + ' ' + orphans[i].name + ' ' + (nid < orphanId && orphanId < rid) + ' nid=' + nid + ' oid=' + orphanId + ' rid=' + rid);
			}
			if ((add_lhs || nid < orphanId) && orphanId < rid) {
				let oidx = getIdxByName(dataset, orphans[i].name);
				dataset[oidx].mother = mother.name;
				dataset[oidx].father = father.name;
			}
		}
	}

	if (depth === 2) {
		mother.top_level = true;
		father.top_level = true;
	} else if (depth > 2) {
		mother.noparents = true;
		father.noparents = true;
	}

	let idx = getIdxByName(dataset, node.name);
	dataset[idx].mother = mother.name;
	dataset[idx].father = father.name;
	delete dataset[idx].noparents;

	if ('parent_node' in node && partnerName) {
		let ptr_node = dataset[getIdxByName(dataset, partnerName)];
		if ('noparents' in ptr_node) {
			ptr_node.mother = mother.name;
			ptr_node.father = father.name;
		}
	}
}

// add partner
export function addPartner(opts: Options, dataset: PedigreeDatasetNode[], name: string): void {
	let root = roots[opts.targetDiv];
	let flat_tree = flattenD3(root);
	let tree_node = getD3NodeByName(flat_tree, name);

	if (!tree_node) {
		return;
	}

	let partner = addSibling(dataset, tree_node.data, tree_node.data.sex === 'F' ? 'M' : 'F', tree_node.data.sex === 'F');
	if (partner instanceof Error) return;
	partner.noparents = true;

	let child: PedigreeDatasetNode = {
		famid: tree_node.data.famid,
		name: makeid(4),
		display_name: '',
		sex: 'M',
		proband: false,
		ashkenazi: false,
		status: '0',
		parent: null
	};
	child.mother = (tree_node.data.sex === 'F' ? tree_node.data.name : partner.name);
	child.father = (tree_node.data.sex === 'F' ? partner.name : tree_node.data.name);

	let idx = getIdxByName(dataset, tree_node.data.name) + 2;
	dataset.splice(idx, 0, child);
}

// get adjacent nodes at the same depth
function adjacent_nodes(root: HierarchyNode<PedigreeDatasetNode>, node: HierarchyNode<PedigreeDatasetNode>, excludes: string[]): [any, any] {
	let nodesAtDepth = getNodesAtDepth(flattenD3(root), node.depth, excludes);
	let lhs_node: any, rhs_node: any;
	for (let i = 0; i < nodesAtDepth.length; i++) {
		const nodeAtDepthX = nodesAtDepth[i].x
		if (!nodeAtDepthX || !node.x) {
			continue
		}
		if (nodeAtDepthX < node.x) {
			lhs_node = nodesAtDepth[i]
		}
		if (!rhs_node && nodeAtDepthX > node.x) {
			rhs_node = nodesAtDepth[i];
		}
	}
	return [lhs_node, rhs_node];
}

// delete a node and descendants
export function delete_node_dataset(dataset: PedigreeDatasetNode[], node: PedigreeDatasetNode, opts: Options, onDone?: (opts: Options, dataset?: PedigreeDatasetNode[]) => void): PedigreeDatasetNode[] {
	let root = roots[opts.targetDiv];
	let fnodes = flattenD3(root);
	let deletes: any[] = [];
	let i: number, j: number;

	// get d3 data node
	if (node.id === undefined) {
		let d3node = getD3NodeByName(fnodes, node.name);
		if (d3node !== undefined) {
			node = d3node.data;
		}
	}

	if (node.parent_node) {
		for (i = 0; i < node.parent_node.length; i++) {
			let parent = node.parent_node[i];
			let ps = [
				getPedigreeNodeByName(dataset, getName(parent.mother)),
				getPedigreeNodeByName(dataset, getName(parent.father))
			].filter(node => !!node);
			// delete parents
			for (j = 0; j < ps.length; j++) {
				if (ps[j].name === node.name || ps[j].noparents !== undefined || ps[j].top_level) {
					dataset.splice(getIdxByName(dataset, ps[j].name), 1);
					deletes.push(ps[j]);
				}
			}

			let children = parent.children?.filter(child => !!child) || [];
			let children_names = children.map((p: any) => p.name);
			for (j = 0; j < children.length; j++) {
				let child = getPedigreeNodeByName(dataset, children[j].name);
				if (child) {
					child.noparents = true;
					let partners = getPartners(dataset, child);
					let partner;
					if (partners.length > 0) {
						partner = getPedigreeNodeByName(dataset, getName(partners[0]))
					}
					if (partner && partner.mother !== child.mother) {
						child.mother = partner.mother;
						child.father = partner.father;
					} else if (partner) {
						let child_node = getD3NodeByName(fnodes, child.name);
						if (!child_node) {
							continue
						}
						let adj = adjacent_nodes(root, child_node, children_names);
						child.mother = adj[0] ? adj[0].data.mother : (adj[1] ? adj[1].data.mother : null);
						child.father = adj[0] ? adj[0].data.father : (adj[1] ? adj[1].data.father : null);
					} else {
						dataset.splice(getIdxByName(dataset, child.name), 1);
					}
				}
			}
		}
	} else {
		dataset.splice(getIdxByName(dataset, node.name), 1);
	}

	// delete ancestors
	console.log(deletes);
	for (i = 0; i < deletes.length; i++) {
		let del = deletes[i];
		let siblings = getAllSiblings(dataset, del);
		console.log('DEL', del.name, siblings);
		if (siblings.length < 1) {
			console.log('del sibs', del.name, siblings);
			let data_node = getD3NodeByName(fnodes, del.name);
			let ancestors = data_node?.ancestors() || [];
			for (j = 0; j < ancestors.length; j++) {
				console.log(ancestors[i]);
				if (ancestors[j].data.mother) {
					console.log('DELETE ', ancestors[j].data.mother, ancestors[j].data.father);
					dataset.splice(getIdxByName(dataset, getName(ancestors[j].data.mother)), 1);
					dataset.splice(getIdxByName(dataset, getName(ancestors[j].data.father)), 1);
				}
			}
		}
	}
	// check integrity of mztwins settings
	checkTwins(dataset);

	let uc: any[];
	try {
		// validate new pedigree dataset
		let newopts = Object.assign({}, opts);
		newopts.dataset = copy_dataset(dataset);
		validatePedigree(newopts);
		// check if pedigree is split
		uc = unconnected(dataset);
	} catch (err) {
		messages('Warning', 'Deletion of this pedigree member is disallowed.');
		throw err;
	}
	if (uc.length > 0) {
		// check & warn only if this is a new split
		if (unconnected(opts.dataset || []).length === 0) {
			console.error("individuals unconnected to pedigree ", uc);
			messages("Warning", "Deleting this will split the pedigree. Continue?", onDone, opts, dataset);
			return dataset;
		}
	}

	if (onDone) {
		onDone(opts, dataset);
	}
	return dataset;
}
