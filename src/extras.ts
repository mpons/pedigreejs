/**
/* Functions used by 3rd party apps
/*
/* © 2023 University of Cambridge
/* SPDX-FileCopyrightText: 2023 University of Cambridge
/* SPDX-License-Identifier: GPL-3.0-or-later
**/
import {copy_dataset, getNodeByName, getProbandIndex} from './utils.js';
import {rebuild} from './pedigree.js';
import {delete_node_dataset} from './widgets.js';
import {addChild} from './widgets.js';
import {syncTwins} from './twins.js';
import * as pedcache from './pedcache.js';
import {Options} from "@/models/Options.ts";
import {Sex} from "@/models/Types/Sex.ts";
import {PedigreeDatasetNode} from "@/models/PedigreeDatasetNode.ts";


// Set or remove node attributes.
// If a value is not provided the attribute is removed.
// 'key' can be a list of keys or a single key.
export function node_attr(opts: Options, name: string, keys: string[], value: string){
	let newdataset = copy_dataset(pedcache.current(opts));
	let node = getNodeByName(newdataset, name);
	if(!node){
		console.warn("No person defined");
		return;
	}

	if(!Array.isArray(keys)) {
		keys = [keys];
	}

	if(value) {
		for(let i=0; i<keys.length; i++) {
			let k = keys[i];
			//console.log('VALUE PROVIDED', k, value, (k in node));
			if(k in node && keys.length === 1) {
				if(node[k] === value)
					return;
				try {
				   if(JSON.stringify(node[k]) === JSON.stringify(value))
					   return;
				} catch(e){
					// continue regardless of error
				}
			}
			node[k] = value;
		}
	} else {
		let found = false;
		for(let i=0; i<keys.length; i++) {
			let k = keys[i];
			//console.log('NO VALUE PROVIDED', k, (k in node));
			if(k in node) {
				delete node[k];
				found = true;
			}
		}
		if(!found)
			return;
	}
	syncTwins(newdataset, node);
	opts.dataset = newdataset;
	rebuild(opts);
}

// Set or remove proband attributes.
// If a value is not provided the attribute is removed from the proband.
// 'key' can be a list of keys or a single key.
export function proband_attr(opts: Options, keys: string[], value: string){
	if (!opts.dataset) {
		return;
	}

	const probandIndex = getProbandIndex(opts.dataset)
	if (!probandIndex) {
		return
	}
	let proband = opts.dataset[ probandIndex ];
	node_attr(opts, proband.name, keys, value);
}

// add a child to the proband; giveb sex, age, yob and breastfeeding months (optional)
export function proband_add_child(opts: Options, sex: Sex, age: number, yob: number, breastfeeding: number){
	let newdataset = copy_dataset(pedcache.current(opts));
	const probandIndex = getProbandIndex(newdataset)
	if (!probandIndex) {
		return
	}
	let proband = newdataset[probandIndex];
	if(!proband){
		console.warn("No proband defined");
		return;
	}
	let newchild = addChild(opts, newdataset, proband, sex, 1)[0];
	newchild.age = age;
	newchild.yob = yob;
	if(breastfeeding !== undefined)
		newchild.breastfeeding = breastfeeding;
	opts.dataset = newdataset;
	if (opts.onChange) {
		opts.onChange(opts.dataset)
	}
	rebuild(opts);
	return newchild.name;
}

// delete node using the name
export function delete_node_by_name(opts: Options, name: string){
	function onDone(opts: Options, dataset: PedigreeDatasetNode[]) {
		// assign new dataset and rebuild pedigree
		opts.dataset = dataset;
		if (opts.onDone) {
			opts.onDone(dataset)
		}
		rebuild(opts);
	}
	let newdataset = copy_dataset(pedcache.current(opts));
	let node = getNodeByName(pedcache.current(opts), name);
	if(!node){
		console.warn("No node defined");
		return;
	}
	delete_node_dataset(newdataset, node, opts, onDone);
}
