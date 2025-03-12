/**
/* © 2023 University of Cambridge
/* SPDX-FileCopyrightText: 2023 University of Cambridge
/* SPDX-License-Identifier: GPL-3.0-or-later
**/
// pedigree widgets
import * as utils from './utils.js';
import { save } from './popup_form.js';
import { current as pedcache_current } from './pedcache.js';
import { getUniqueTwinID, setMzTwin, checkTwins } from './twins.js';
import { Options } from "@/models/Options";
import { HierarchyPointNode, select, selectAll, drag, pointer, Selection, BaseType } from "d3";
import { PedigreeDatasetNode } from "@/models/PedigreeDatasetNode";

let dragging: HierarchyPointNode<PedigreeDatasetNode> | undefined;
let last_mouseover: HierarchyPointNode<PedigreeDatasetNode> | undefined;

//
// Add widgets to nodes and bind events
export function addWidgets(opts: Options, node: Selection<BaseType, HierarchyPointNode<PedigreeDatasetNode>, HTMLElement, any>) {
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

	let add_person: { node?: HierarchyPointNode<PedigreeDatasetNode>; type?: string } = {};

	// Click the person type selection
	selectAll<SVGTextElement, unknown>(".persontype")
		.on("click", function () {
			const newdataset = utils.copy_dataset(pedcache_current(opts));
			const isMztwin = select(this).classed("mztwin");
			const isDztwin = select(this).classed("dztwin");
			let twinType: string | undefined;
			let sex: string;

			if (isMztwin || isDztwin) {
				sex = add_person.node?.datum().data.sex || 'U';
				twinType = isMztwin ? "mztwin" : "dztwin";
			} else {
				sex = select(this).classed("fa-square") ? 'M' : (select(this).classed("fa-circle") ? 'F' : 'U');
			}

			if (add_person.type === 'addsibling') {
				addsibling(opts, newdataset, add_person.node!.datum().data, sex, false, twinType);
			} else if (add_person.type === 'addchild') {
				addchild(opts, newdataset, add_person.node!.datum().data, twinType ? 'U' : sex, twinType ? 2 : 1, twinType);
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
		return d.data.hidden && !opts.DEBUG ? false : true;
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
			.attr("xx", function (d) { return d.x; })
			.attr("yy", function (d) { return d.y; })
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
	selectAll(".addsibling, .addchild")
		.on("mouseover", function () {
			const type = select(this).attr('class');
			selectAll('.popup_selection').style("opacity", 1);
			add_person = { 'node': select(this.parentNode), 'type': type };

			const x = parseInt(select(this).attr("xx")!) + parseInt(select(this).attr("x")!);
			const y = parseInt(select(this).attr("yy")!) + parseInt(select(this).attr("y")!);
			selectAll('.popup_selection').attr("transform", `translate(${x},${y + 2})`);
			selectAll('.popup_selection_rotate45')
				.attr("transform", `translate(${x + (3 * fontSize)},${y + (fontSize * 1.2)}) rotate(45)`);
		});

	// Handle widget clicks
	selectAll(".addchild, .addpartner, .addparents, .delete, .settings")
		.on("click", function (e) {
			e.stopPropagation();
			const opt = select(this).attr('class');
			const d = select(this.parentNode).datum();
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
				newdataset = utils.copy_dataset(pedcache_current(opts));
				delete_node_dataset(newdataset, d.data, opts, onDone);
			} else if (opt === 'addparents') {
				newdataset = utils.copy_dataset(pedcache_current(opts));
				opts.dataset = newdataset;
				addparents(opts, newdataset, d.data.name);
				document.dispatchEvent(new CustomEvent('rebuild', { detail: opts }));
			} else if (opt === 'addpartner') {
				newdataset = utils.copy_dataset(pedcache_current(opts));
				addpartner(opts, newdataset, d.data.name);
				opts.dataset = newdataset;
				document.dispatchEvent(new CustomEvent('rebuild', { detail: opts }));
			}
			// Trigger fhChange event
			document.dispatchEvent(new CustomEvent('fhChange', { detail: opts }));
		});

	// Other mouse events
	let highlight: HierarchyPointNode<PedigreeDatasetNode>[] = [];

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

			if ('nodeclick' in opts) {
				opts.nodeclick(d.data);
				selectAll(".indi_rect").style("opacity", 0);
				selectAll('.indi_rect').filter(function (d) { return highlight.indexOf(d) !== -1; }).style("opacity", 0.5);
			}
		})
		.on("mouseover", function (e, d) {
			e.stopPropagation();
			last_mouseover = d;
			if (dragging) {
				if (dragging.data.name !== last_mouseover.data.name &&
					dragging.data.sex !== last_mouseover.data.sex) {
					select(this).select('rect').style("opacity", 0.2);
				}
				return;
			}
			select(this).select('rect').style("opacity", 0.2);
			select(this).selectAll('.addchild, .addsibling, .addpartner, .addparents, .delete, .settings').style("opacity", 1);
			select(this).selectAll('.indi_details').style("opacity", 0);

			setLineDragPosition(opts.symbol_size - 10, 0, opts.symbol_size - 2, 0, `${d.x},${d.y + 2}`);
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

function onDone(opts: Options, dataset: PedigreeDatasetNode[]) {
	// Assign new dataset and rebuild pedigree
	opts.dataset = dataset;
	opts.onDone?.(dataset);

	document.dispatchEvent(new CustomEvent('rebuild', { detail: opts }));
}

// Drag line between nodes to create partners
function drag_handle(opts: Options) {
	const lineDragSelection = select('.diagram');
	const dline = lineDragSelection.append("line").attr("class", 'line_drag_selection')
		.attr("stroke-width", 6)
		.style("stroke-dasharray", ("2, 1"))
		.attr("stroke", "black")
		.call(drag<SVGGElement, HierarchyPointNode<PedigreeDatasetNode>>()
			.on("start", dragstart)
			.on("drag", onDrag)
			.on("end", dragstop));
	dline.append("svg:title").text("drag to create consanguineous partners");

	setLineDragPosition(0, 0, 0, 0);

	function dragstart() {
		dragging = last_mouseover;
		selectAll('.line_drag_selection')
			.attr("stroke", "darkred");
	}

	function dragstop() {
		if (last_mouseover &&
			dragging!.data.name !== last_mouseover.data.name &&
			dragging!.data.sex !== last_mouseover.data.sex) {
			// Make partners
			const child = {
				"name": utils.makeid(4), "sex": 'U',
				"mother": (dragging!.data.sex === 'F' ? dragging!.data.name : last_mouseover.data.name),
				"father": (dragging!.data.sex === 'F' ? last_mouseover.data.name : dragging!.data.name)
			};
			const newdataset = utils.copy_dataset(opts.dataset || []);
			opts.dataset = newdataset;

			const idx = utils.getIdxByName(opts.dataset, dragging!.data.name) + 1;
			opts.dataset.splice(idx, 0, child);
			document.dispatchEvent(new CustomEvent('rebuild', { detail: opts }));
		}
		setLineDragPosition(0, 0, 0, 0);
		selectAll('.line_drag_selection')
			.attr("stroke", "black");
		dragging = undefined;
		return;
	}

	function onDrag(e: any) {
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

function capitaliseFirstLetter(string: string) {
	return string.charAt(0).toUpperCase() + string.slice(1);
}

// If opt.edit is set true (rather than given a function) this is called to edit node attributes
function openEditDialog(opts: Options, d: any) {
	if (opts.onEdit) {
		opts.onEdit(d.data.name);
	}

	const nodeProperties = document.getElementById('node_properties');
	if (!nodeProperties) return;

	nodeProperties.innerHTML = ''; // Clear existing content
	const dialogTitle = d.data.display_name || 'Node Properties';

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


