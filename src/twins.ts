/**
/* © 2023 University of Cambridge
/* SPDX-FileCopyrightText: 2023 University of Cambridge
/* SPDX-License-Identifier: GPL-3.0-or-later
**/
import {PedigreeDatasetNode} from "@/models/PedigreeDatasetNode.ts";


// set two siblings as twins
export function setMzTwin(
	dataset: PedigreeDatasetNode[],
	d1: PedigreeDatasetNode,
	d2: PedigreeDatasetNode,
	twin_type: keyof Pick<PedigreeDatasetNode, 'mztwin'|'dztwin'>
) {
	if(!d1[twin_type]) {
		const twinId = getUniqueTwinID(dataset, twin_type)
		if (!twinId) {
			return false
		}

		d1[twin_type] = twinId
	}
	d2[twin_type] = d1[twin_type];
	if(d1.yob)
		d2.yob = d1.yob;
	if(d1.age && (d1.status === "0" || !d1.status))
		d2.age = d1.age;
	return true;
}

// get a new unique twins ID, max of 10 twins in a pedigree
export function getUniqueTwinID(dataset: PedigreeDatasetNode[], twin_type: keyof Pick<PedigreeDatasetNode, 'mztwin'|'dztwin'>) {
	let mz = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'A'];
	for(let i=0; i<dataset.length; i++) {
		if(dataset[i][twin_type]) {
			let idx = mz.indexOf(dataset[i][twin_type] || '0');
			if (idx > -1)
				mz.splice(idx, 1);
		}
	}
	if(mz.length > 0)
		return mz[0];

	return undefined;
}

// sync attributes of twins
export function syncTwins(dataset: PedigreeDatasetNode[], d1: PedigreeDatasetNode) {
	if(!d1.mztwin && !d1.dztwin)
		return;
	let twin_type = (d1.mztwin ? "mztwin" : "dztwin") as keyof Pick<PedigreeDatasetNode, 'mztwin'|'dztwin'>;
	for(let i=0; i<dataset.length; i++) {
		let d2 = dataset[i];
		if(d2[twin_type] && d1[twin_type] === d2[twin_type] && d2.name !== d1.name) {
			if(twin_type === "mztwin")
			  d2.sex = d1.sex;
			if(d1.yob)
				d2.yob = d1.yob;
			if(d1.age && (d1.status === '0' || !d1.status))
				d2.age = d1.age;
		}
	}
}

// check integrity twin settings
export function checkTwins(dataset: PedigreeDatasetNode[]) {
	let twin_types: (keyof Pick<PedigreeDatasetNode, 'mztwin'|'dztwin'>)[] = ["mztwin", "dztwin"];
	for(let i=0; i<dataset.length; i++) {
		for(let j=0; j<twin_types.length; j++) {
			let twin_type = twin_types[j];
			if(dataset[i][twin_type]) {
				let count = 0;
				for(let j=0; j<dataset.length; j++) {
					if(dataset[j][twin_type] === dataset[i][twin_type])
						count++;
				}
				if(count < 2)
					delete dataset[i][twin_type];
			}
		}
	}
}