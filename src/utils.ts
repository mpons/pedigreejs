/**
/* © 2023 University of Cambridge
/* SPDX-FileCopyrightText: 2023 University of Cambridge
/* SPDX-License-Identifier: GPL-3.0-or-later
**/

// Pedigree Tree Utils
import { Options } from './models/Options.js';
import * as pedcache from './pedcache.ts';
import {PedigreeDatasetNode} from "@/models/PedigreeDatasetNode.ts";
import {Sex} from "@/models/Types/Sex.ts";
import {HierarchyNode} from "d3";
import {D3PartnerLink, PedigreePartnerLink} from "@/models/Types/PartnerLink.ts";


export let roots: Record<string, HierarchyNode<PedigreeDatasetNode>> = {};

export function isIE(): boolean {
	 let ua = navigator.userAgent;
	 /* MSIE used to detect old browsers and Trident used to newer ones*/
	 return ua.indexOf("MSIE ") > -1 || ua.indexOf("Trident/") > -1;
}

export function isEdge() {
	 return navigator.userAgent.match(/Edge/g);
}

export function create_err(err: string) {
	console.error(err);
	return new Error(err);
}

// validate pedigree data
export function validatePedigree(opts: Options): boolean {
	if(opts.validate) {
		if (typeof opts.validate == 'function') {
			if(opts.DEBUG)
				console.log('CALLING CONFIGURED VALIDATION FUNCTION');
			return opts.validate(opts);
		}

		// check consistency of parents sex
		const uniquenames: string[] = [];
		const famids: string[] = [];

		let display_name;
		if (!opts.dataset) {
			return false;
		}
		for(let p=0; p < opts.dataset.length; p++) {
			if(opts.dataset[p].mother || opts.dataset[p].father) {
				display_name = opts.dataset[p].display_name;
				if(!display_name)
					display_name = 'unnamed';
				display_name += ' (IndivID: '+opts.dataset[p].name+')';
				let mother = opts.dataset[p].mother;
				let father = opts.dataset[p].father;
				if(!mother || !father) {
					throw create_err('Missing parent for '+display_name);
				}

				let midx = getIdxByName(opts.dataset, getName(mother));
				let fidx = getIdxByName(opts.dataset, getName(father));
				if(midx === -1)
					throw create_err('The mother (IndivID: '+mother+') of family member '+
									 display_name+' is missing from the pedigree.');
				if(fidx === -1)
					throw create_err('The father (IndivID: '+father+') of family member '+
									 display_name+' is missing from the pedigree.');
				if(opts.dataset[midx].sex !== "F")
					throw create_err("The mother of family member "+display_name+
							" is not specified as female. All mothers in the pedigree must have sex specified as 'F'.");
				if(opts.dataset[fidx].sex !== "M")
					throw create_err("The father of family member "+display_name+
							" is not specified as male. All fathers in the pedigree must have sex specified as 'M'.");
			}


			if(!opts.dataset[p].name) {
				throw create_err(display_name + ' has no IndivID.');
			}

			if(uniquenames.includes(opts.dataset[p].name)) {
				throw create_err('IndivID for family member ' + display_name + ' is not unique.');
			}

			uniquenames.push(opts.dataset[p].name);

			if(!famids.includes(opts.dataset[p].famid) && opts.dataset[p].famid) {
				famids.push(opts.dataset[p].famid);
			}
		}

		if(famids.length > 1) {
			throw create_err('More than one family found: '+famids.join(", ")+'.');
		}
		// warn if there is a break in the pedigree
		let uc = unconnected(opts.dataset);
		if(uc.length > 0) {
			console.warn("individuals unconnected to pedigree ", uc);
		}
	}

	return true;
}

export function copy_dataset(dataset: PedigreeDatasetNode[]): PedigreeDatasetNode[] {
	if (dataset.length > 0 && dataset[0].id) { // sort by id
		dataset.sort(function(a, b) {
			return (!a.id || !b.id ? 0 : (a.id > b.id) ? 1 : ((b.id > a.id) ? -1 : 0));
		});
	}

	const newdataset: PedigreeDatasetNode[] = [];

	for (let i = 0; i < dataset.length; i++) {
		const obj = {...dataset[i]};
		obj.id = undefined
		obj.parent_node = undefined
		newdataset.push(obj);
	}

	return newdataset;
}

// check if the object contains a key with a given prefix
export function prefixInObj(prefix: string, obj: Record<string, any>): boolean {
	let found = false;

	if (obj) {
		Object.keys(obj).some(k => {
			if (k.indexOf(prefix + "_") === 0 || k === prefix) {
				found = true;
				return true;
			}
			return false;
		});
	}

	return found;
}


/**
 *  Get formatted time or data & time
 */
export function getFormattedDate(timeOnly: boolean){
	let d = new Date();
	if(timeOnly)
		return ('0' + d.getHours()).slice(-2) + ":" + ('0' + d.getMinutes()).slice(-2) + ":" + ('0' + d.getSeconds()).slice(-2);
	else
		return d.getFullYear() + "-" + ('0' + (d.getMonth() + 1)).slice(-2) + "-" + ('0' + d.getDate()).slice(-2) + " " + ('0' + d.getHours()).slice(-2) + ":" + ('0' + d.getMinutes()).slice(-2) + ":" + ('0' + d.getSeconds()).slice(-2);
 }

function showDialog(title: string, msg: string, onConfirm: (opts: Options, dataset: PedigreeDatasetNode[]) => void, opts: Options, dataset: PedigreeDatasetNode[]) {
	const errModalEl = document.getElementById('errModal');
	const modalTitle = errModalEl?.querySelector('.modal-title');
	const modalBodyInput = errModalEl?.querySelector('.modal-body');
	if(onConfirm) {
		document.querySelectorAll('#errModal button.hidden').forEach((elt) => elt.classList.remove("hidden"));
		Array.from(document.querySelectorAll('#errModal button'))
			.filter(
				(button) => button.textContent?.includes('OK')
			).forEach((elt) => {
				elt.addEventListener("click", () => {
					onConfirm(opts, dataset);
					elt.addEventListener('click', () => {});
				})
			})
	} else {
		const cancelBtn = Array.from(document.querySelectorAll('#errModal button'))
			.filter(
				(button) => button.textContent?.includes('CANCEL')
			)[0];
		if(!cancelBtn.classList.contains("hidden")) {
			cancelBtn.classList.add("hidden");
		}
		Array.from(document.querySelectorAll('#errModal button'))
			.filter(
				(button) => button.textContent?.includes('OK')
			).forEach((elt) => {
				elt.addEventListener('click', () => {});
			})
	}

	if (modalTitle) {
		modalTitle.textContent = title;
	}
	if (modalBodyInput) {
		modalBodyInput.textContent = msg;
	}

	//document.getElementById("errModal").modal("show");
}

/**
 * Show message or confirmation dialog.
 * @param title	 - dialog window title
 * @param msg	   - message to diasplay
 * @param onConfirm - function to call in a confirmation dialog
 * @param opts	  - pedigreejs options
 * @param dataset	- pedigree dataset
 */
export function messages(title: string, msg: string, onConfirm: (opts: Options) => void, opts: Options, dataset: PedigreeDatasetNode[]) {
	// try {
	// 	if(onConfirm) {
	// 		$('<div id="msgDialog">'+msg+'</div>').dialog({
	// 				modal: true,
	// 				title: title,
	// 				width: 350,
	// 				buttons: {
	// 					"Yes": function () {
	// 						$(this).dialog('close');
	// 						onConfirm(opts, dataset);
	// 					},
	// 					"No": function () {
	// 						$(this).dialog('close');
	// 					}
	// 				}
	// 			});
	// 	} else {
	// 		$('<div id="msgDialog">'+msg+'</div>').dialog({
	// 			title: title,
	// 			width: 350,
	// 			buttons: [{
	// 				text: "OK",
	// 				click: function() { $( this ).dialog( "close" );}
	// 			}]
	// 		});
	// 	}
	// } catch(err) {
		showDialog(title, msg, onConfirm, opts, dataset);
	//}
}

/**
 * Validate age and yob is consistent with current year. The sum of age and
 * yob should not be greater than or equal to current year. If alive the
 * absolute difference between the sum of age and year of birth and the
 * current year should be <= 1.
 * @param age	- age in years.
 * @param yob	- year of birth.
 * @param status - 0 = alive, 1 = dead.
 * @return true if age and yob are consistent with current year otherwise false.
 */
export function validate_age_yob(age: string, yob: string, status: string) {
	let year = new Date().getFullYear();
	let sum = parseInt(age) + parseInt(yob);
	// check status is an expected string
	if (status !== "1" && status !== "0")
		return false

	if(status === "1") {   // deceased
		return year >= sum;
	}
	return Math.abs(year - sum) <= 1 && year >= sum;
}

export function capitaliseFirstLetter(string: string) {
	return string.charAt(0).toUpperCase() + string.slice(1);
}


export function makeid(len: number) {
	let text = "";
	let possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
	for( let i=0; i < len; i++ )
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	return text;
}

export function buildTree(
	opts: Options,
	referencePerson: PedigreeDatasetNode,
	root: PedigreeDatasetNode,
	partnerLinks?: PedigreePartnerLink[],
	givenId?: number
): [PedigreePartnerLink[], number] {
	if (!opts.dataset) {
		opts.dataset = []
	}

	if (!referencePerson.children) {
		referencePerson.children = getChildrenFromFemale(opts.dataset, referencePerson);
	}

	if (partnerLinks === undefined) {
		partnerLinks = [];
	}

	let id = givenId || 1

	let currentNodes = flatten(root);
	let partners: PedigreePartnerLink[] = [];

	// We go through all the children of the given person
	// Meaning we look only at a subtree starting from the given person/node
	// We look at the whole tree if we gave the top node (hidden) as input
	referencePerson.children?.forEach((child) => {
		opts.dataset?.forEach((person) => {
			if ((child.name === getName(person.mother) || child.name === getName(person.father))
				&& child.id === undefined
			) {
				// Here the child is the person's mother or father
				// M or F will be the current child, we use the father/mother of the current person to create partners
				let m = getPedigreeNodeByName(currentNodes, getName(person.mother));
				let f = getPedigreeNodeByName(currentNodes, getName(person.father));

				// Should be possible to delete the following 2 lines
				//m = (m !== undefined ? m : getPedigreeNodeByName(opts.dataset || [], getName(person.mother)));
				//f = (f !== undefined ? f : getPedigreeNodeByName(opts.dataset || [], getName(person.father)));

				if (!contains_parent(partners, m, f)) {
					partners.push({
						female: m,
						male: f
					});
				}
			}
		});
	});

	if (givenId === undefined) {
		// We balance the first generation
		const partnersFatherSide = partners.filter(({female, male}) => (female?.realProbandDistance || 0) + (male?.realProbandDistance || 0) < 0)
		const partnersMotherSide = partners.filter(({female, male}) => (female?.realProbandDistance || 0) + (male?.realProbandDistance || 0) > 0)

		partners = [...middleBalancedSort(partnersFatherSide), ...middleBalancedSort(partnersMotherSide)]
	}

	partners
		.forEach(({female, male}) => {
			if (female === undefined || male === undefined) {
				return
			}

			female.children = [];

			let parent: PedigreeDatasetNode = {
				famid: female.famid,
				id: undefined,
				name : makeid(4),
				hidden : true,
				parent : null,
				father : male,
				mother : female,
				children : getChildrenFromFemale(opts.dataset!, female, male),
				sex: 'U', // hidden node
				display_name: '',
				status: "0",
				proband: false,
				ashkenazi: false,
			};

			let midx = getIdxByName(opts.dataset!, female.name)
			let fidx = getIdxByName(opts.dataset!, male.name)

			if((!('id' in male) && !('id' in female)) || (male.id === undefined && female.id === undefined)) {
				id = setChildrenId(referencePerson.children || [], id || 0);
			}

			// look at grandparents index
			let gp = getGrandparentsIdx(opts.dataset!, midx, fidx);
			//const sign = (father.probandDistance || 1) / Math.abs(father.probandDistance || 1)
			const parentDistance = ((male.displayProbandDistance || 1) + (male.displayProbandDistance || 1)) / 2
			if (gp.fidx < gp.midx) {
			 	male.id = (id!++) * (male.displayProbandDistance || 1);
			 	parent.id = (id!++) * (parentDistance);
			 	female.id = (id!++) * (female.displayProbandDistance || 1);
			} else {
				female.id = (id!++) * (female.displayProbandDistance || 1);
				parent.id = (id!++) * (parentDistance);
				male.id = (id!++) * (male.displayProbandDistance || 1);
			}

			updateParent(female, parent);
			updateParent(male, parent);

			if (referencePerson.children === undefined) {
				referencePerson.children = []
			}

			referencePerson.children.push(parent);
		});

	partnerLinks = [...partnerLinks, ...partners];

	id = setChildrenId(referencePerson.children, id);

	referencePerson.children.forEach((person) => {
		[partnerLinks, id] = buildTree(opts, person, root, partnerLinks, id);
	});

	return [partnerLinks, id];
}

function middleBalancedSort(partners: PedigreePartnerLink[]): PedigreePartnerLink[] {
	if (partners.length <= 1) return partners;

	if (partners.length <= 2) {
		return [...partners].sort((a, b) =>
		{
			const aPairDistance = (a.female?.realProbandDistance || 0) + (a.male?.realProbandDistance || 0)
			const bPairDistance = (b.female?.realProbandDistance || 0) + (b.male?.realProbandDistance || 0)

			return aPairDistance - bPairDistance
		});
	}

	// Create a copy and sort in ascending order
	const sorted = [...partners].sort((a, b) =>
	{
		const aPairDistance = Math.abs((a.female?.realProbandDistance || 0) + (a.male?.realProbandDistance || 0))
		const bPairDistance = Math.abs((b.female?.realProbandDistance || 0) + (b.male?.realProbandDistance || 0))

		return aPairDistance - bPairDistance
	});
	const result: PedigreePartnerLink[] = [];

	let middle = Math.floor((sorted.length) / 2);

	// Place smallest value in the middle
	result[middle] = sorted[0];

	// Fill remaining positions alternating between left and right sides
	let currentIndex = 1;
	let isLeft = true;

	for (let i = 1; i < sorted.length; i++) {
		if (isLeft) {
			result[middle - currentIndex] = sorted[i];
			isLeft = false;
		} else {
			result[middle + currentIndex] = sorted[i];
			isLeft = true;
			currentIndex++;
		}
	}

	return result;
}



// update parent node and sort twins
function updateParent(
	person: PedigreeDatasetNode,
	parent: PedigreeDatasetNode,
) {

	person.parent_node = person.parent_node || []
	person.parent_node.push(parent);
}

function setChildrenId(children: PedigreeDatasetNode[], startId: number) {
	// sort twins to lie next to each other
	// Sort equal distance to proband nodes to be next to each other
	children.sort(function(a, b) {
		if(a.mztwin && b.mztwin && a.mztwin === b.mztwin) {
			return 0
		}

		if(a.dztwin && b.dztwin && a.dztwin === b.dztwin) {
			return 0
		}

		if(a.mztwin || b.mztwin || a.dztwin || b.dztwin) {
			return 1
		}

		return 0
	});

	children.forEach((p) => {
		if (p.id === undefined) {
			p.id = (startId++) * (p.displayProbandDistance || 1);
		}
	})

	return startId;
}

export function isProband(person?: PedigreeDatasetNode): boolean {
	return !!person?.proband;
}

export function setProband(dataset: PedigreeDatasetNode[], name: string, is_proband: boolean): void {
	dataset.forEach((p)=> {
		if (name === p.name) {
			p.proband = is_proband;
		} else {
			p.proband = false;
		}
	});
}

//combine arrays ignoring duplicates
function combineArrays(arr1: unknown[], arr2: unknown[]) {
	for(let i=0; i < arr2.length; i++) {
		if (!arr1.includes(arr2[i])) {
			arr1.push(arr2[i]);
		}
	}
}

function include_children(connected: string[], person: PedigreeDatasetNode, dataset: PedigreeDatasetNode[]) {
	if(!connected.includes(person.name)) {
		return;
	}

	combineArrays(connected, getPartnersNames(dataset, person));

	let children = getAllChildren(dataset, person);
	children.forEach((child) => {
		if (!child?.name) {
			return
		}

		if(!connected.includes(child.name)) {
			connected.push(child.name);
			combineArrays(connected, getPartnersNames(dataset, child));
		}
	});
}

//get the partners for a given node
export function getPartnersNames(dataset: PedigreeDatasetNode[], referenceNode: PedigreeDatasetNode) {
	let partners: string[] = [];

	// Go through the dataset and try to see if the referenceNode
	// is the mother or father of another node, if yes, that means they are a parent and the other
	// parent can be added as a partner
	for(let i=0; i < dataset.length; i++) {
		let anotherNode = dataset[i]

		// Reference is the mother of another node, we add the father of anotherNode as a partner
		if(referenceNode.name === getName(anotherNode.mother) && !partners.includes(getName(anotherNode.father))) {
			partners.push(getName(anotherNode.father))
		}

		//Reference is the father of another node, we add the mother of anotherNode as a partner
		if(referenceNode.name === anotherNode.father && !partners.includes(getName(anotherNode.mother))) {
			partners.push(getName(anotherNode.mother))
		}
	}

	return partners;
}

export function getPartners(dataset: PedigreeDatasetNode[], referenceNode: PedigreeDatasetNode): PedigreeDatasetNode[] {
	let partners: PedigreeDatasetNode[] = [];

	// Go through the dataset and try to see if the referenceNode
	// is the mother or father of another node, if yes, that means they are a parent and the other
	// parent can be added as a partner
	for(let i=0; i < dataset.length; i++) {
		let anotherNode = dataset[i]
		let fatherNode: PedigreeDatasetNode|undefined = undefined
		let motherNode: PedigreeDatasetNode|undefined = undefined
		if (typeof anotherNode.father === 'string') {
			fatherNode = getPedigreeNodeByName(dataset, anotherNode.father)
		} else {
			fatherNode = anotherNode.father
		}

		if (typeof anotherNode.mother === 'string') {
			motherNode = getPedigreeNodeByName(dataset, anotherNode.mother)
		} else {
			motherNode = anotherNode.mother
		}

		if (!motherNode || !fatherNode) {
			continue
		}
		// Reference is the mother of another node, we add the father of anotherNode as a partner
		if(referenceNode.name === motherNode.name && !partners.includes(fatherNode)) {
			partners.push(fatherNode)
		}

		//Reference is the father of another node, we add the mother of anotherNode as a partner
		if(referenceNode.name === fatherNode.name && !partners.includes(motherNode)) {
			partners.push(motherNode)
		}
	}

	return partners;
}

//return a list of individuals that aren't connected to the target
export function unconnected(dataset: PedigreeDatasetNode[]){
	let target = getProband(dataset);
	if(!target){
		console.warn("No target defined");
		if(dataset.length === 0) {
			throw new Error("empty pedigree data set");
		}
		target = dataset[0];
	}
	let connected = [target.name];
	let change = true;
	let ii = 0;
	while(change && ii < 200) {
		ii++;
		let nconnect = connected.length;
		dataset.forEach((p ) => {
			if(!connected.includes(p.name)) {
				// check if this person or a partner has a parent
				let partners = getPartnersNames(dataset, p);
				let hasParent = (p.name === target.name || !p.noparents);
				for(let i=0; i<partners.length; i++){
					const searchNode = getPedigreeNodeByName(dataset, partners[i])
					if(searchNode && !searchNode.noparents)
						hasParent = true;
				}

				if(hasParent){
					if(p.mother && !connected.includes(getName(p.mother))) {
						connected.push(getName(p.mother))
					}

					if(p.father && !connected.includes(getName(p.father))) {
						connected.push(getName(p.father));
					}
				}
			} else if( !p.noparents &&
					((p.mother && connected.includes(getName(p.mother))) ||
					(p.father && connected.includes(getName(p.father))))) {
				connected.push(p.name);
			}
			// include any children
			include_children(connected, p, dataset);
		});
		change = (nconnect !== connected.length);
	}
	return dataset
		.map((val) => val.name)
		.map((name) => !connected.includes(name) ? name : null)
		.filter((name) => !!name);
}

export function getProbandIndex(dataset: PedigreeDatasetNode[]) {
	for (let i = 0; i < dataset.length; i++) {
		if (isProband(dataset[i])) {
			return i;
		}
	}
	return;
}

export function getProband(dataset: PedigreeDatasetNode[]): PedigreeDatasetNode|undefined {
	const index = getProbandIndex(dataset)
	if (index === undefined) {
		return;
	}

	return dataset[index]
}

export function getChildrenFromFemale(dataset: PedigreeDatasetNode[], female: PedigreeDatasetNode, male?: PedigreeDatasetNode): PedigreeDatasetNode[] {
	const children: PedigreeDatasetNode[] = [];
	const childrenAlreadyAdded: string[] = [];

	if(female.sex === 'F')
		dataset.forEach((person) => {
			if(female.name === getName(person.mother))
				if(!male || male.name === getName(person.father)) {
					if(!childrenAlreadyAdded.includes(person.name)){
						children.push(person);
						childrenAlreadyAdded.push(person.name);
					}
				}
		});

	return children;
}

function contains_parent(arr: PedigreePartnerLink[], m: PedigreeDatasetNode|string|undefined, f: PedigreeDatasetNode|string|undefined) {
	for(let i=0; i<arr.length; i++)
		if(arr[i].female === m && arr[i].male === f)
			return true;
	return false;
}

// get the mono/di-zygotic twin(s)
export function getTwins(dataset: PedigreeDatasetNode[], person: PedigreeDatasetNode) {
	let siblings = getSiblings(dataset, person);

	return siblings.map((p) => {
		return p.name !== person.name && areTwins(p, person) ? p : null;
	}).filter((p) => !!p);
}

function areTwins(person1: PedigreeDatasetNode, person2: PedigreeDatasetNode): boolean {
	if (!person1.mztwin) {
		if (person1.dztwin) {
			return person1.dztwin === person2.dztwin
		}
	}

	return person1.mztwin === person2.mztwin
}

// get the siblings - sex is an optional parameter
// for only returning brothers or sisters
export function getSiblings(dataset: PedigreeDatasetNode[], referencePerson?: PedigreeDatasetNode, sex?: Sex) {
	if(referencePerson === undefined || !referencePerson.mother || referencePerson.noparents)
		return [];

	return dataset.map((otherPerson) => {
		if (otherPerson.name === referencePerson.name) {
			// We don't need to check ourselves
			return
		}
		if (otherPerson.noparents || otherPerson.mother !== referencePerson.mother
			|| otherPerson.father !== referencePerson.father) {
			// One of the parents is different,
			// Or the person has no parents (i.e. partners)
			// They cannot be direct siblings
			return
		}
		return  (!sex || otherPerson.sex === sex) ? otherPerson : null;
	}).filter((p) => !!p);
}

// get the siblings + adopted siblings - sex is an optional parameter
// for only returning brothers or sisters
export function getAllSiblings(dataset: PedigreeDatasetNode[], referencePerson: PedigreeDatasetNode, sex?: Sex) {
	return dataset.map((otherPerson) => {

		if (otherPerson.name === referencePerson.name) {
			// We don't need to check ourselves
			return
		}

		if (otherPerson.mother !== referencePerson.mother
			&& otherPerson.father !== referencePerson.father) {
			// Both parents are different, they cannot be siblings or adopted siblings
			return
		}

		return  (!sex || otherPerson.sex === sex) ? otherPerson : null;
	}).filter((p) => !!p);
}

// get the adopted siblings of a given individual
export function getAdoptedSiblings(dataset: PedigreeDatasetNode[], person: PedigreeDatasetNode) {
	return dataset.map((p) => {
		return  p.name !== person.name && p.noparents &&
			   (p.mother === person.mother && p.father === person.father) ? p : null;
	}).filter((p) => !!p);
}

export function getAllChildren(dataset: PedigreeDatasetNode[], person: PedigreeDatasetNode, sex?: Sex): PedigreeDatasetNode[] {
	return dataset.map((p)=> {
		return !p.noparents &&
			   (p.mother === person.name || p.father === person.name) &&
			   (!sex || p.sex === sex) ? p : null;
	}).filter((p) => !!p);
}

// get the depth of the given person from the root
export function getDepth(dataset: PedigreeDatasetNode[], name: string): number {
	let idx = getIdxByName(dataset, name);
	let depth = 1;

	while(idx >= 0 && ('mother' in dataset[idx] || dataset[idx].top_level)){
		let motherName = getName(dataset[idx].mother)
		idx = getIdxByName(dataset, motherName);

		depth++;
	}

	return depth;
}

export function computeDistancesFromProband(dataset: PedigreeDatasetNode[]) {
	const visitedPersons: Record<string, boolean> = {}
	let {person: probandPerson} = dataset
		.map((person, id) => {return {person, isProband: person.proband, id}})
		.filter(({isProband}) => isProband)[0]
	probandPerson.displayProbandDistance = 0
	probandPerson.realProbandDistance = 0

	function recurseDistance(person: PedigreeDatasetNode, sideSign: 1|-1) {
		if (visitedPersons[person.name]) {
			return
		}
		visitedPersons[person.name] = true
		const currentDistance = (person.displayProbandDistance || 0)
		//console.log('recurse', person.display_name, currentDistance, sideSign)

		const father = getPedigreeNodeByName(dataset, getName(person.father))
		const mother = getPedigreeNodeByName(dataset, getName(person.mother))
		const partners = getPartners(dataset, person)

		let directRelatives = [father, mother, ...getSiblings(dataset, person), ...getAllChildren(dataset, person)]
			.filter(relative => !!relative)

		partners.forEach((partner) => {
			if (partner.displayProbandDistance === undefined) {
				partner.displayProbandDistance = sideSign * (Math.abs(currentDistance))
				partner.realProbandDistance = sideSign * (Math.abs(currentDistance) + 1)
			}
		})

		directRelatives
			.forEach((relative) => {
				if (relative.displayProbandDistance === undefined) {
					relative.displayProbandDistance = sideSign * (Math.abs(currentDistance) + 1)
					relative.realProbandDistance = sideSign * (Math.abs(currentDistance) + 1)
				}
			})

		directRelatives = [...directRelatives, ...partners]
		directRelatives
		 	.forEach((relative) => {
				 // We recurse only for members on the same side of the family
				// We need to check as we recurse first from the proband's father and the father has the mother
				// as direct relative and we don't want to start recursing on that side with the wrong sign
				const relativeDistance = relative.realProbandDistance || 0
				if (relativeDistance > 0 && sideSign > 0 || relativeDistance < 0 && sideSign < 0) {
					recurseDistance(relative, sideSign)
				}
			})

	}

	// We want to have different signs for the distance to indicate which side of the family, relative to the proband
	// we are on.
	const father = getPedigreeNodeByName(dataset, getName(probandPerson.father))
	if (father) {
		father.displayProbandDistance = -1
		father.realProbandDistance = -1
	}

	const mother = getPedigreeNodeByName(dataset, getName(probandPerson.mother))
	if (mother) {
		mother.displayProbandDistance = 1
		mother.realProbandDistance = 1
	}

	if (father) {
		recurseDistance(father, -1)
	}

	if (mother) {
		recurseDistance(mother, 1)
	}

	console.log('distances', dataset)
}


// given an array of people get an index for a given person
export function getIdxByName(arr: PedigreeDatasetNode[], name: string) {
	for (let i = 0; i < arr.length; i++) {
		if (name === arr[i].name) {
			return i;
		}
	}
	return -1;
}

// get the nodes at a given depth sorted by their x position
export function getNodesAtDepth(fnodes: HierarchyNode<PedigreeDatasetNode>[], depth: number, exclude_names: string[]) {
	return fnodes
		.map((p) => {
			return p.depth === depth && !p.data.hidden && !exclude_names.includes(p.data.name) ? p : null;
		})
		.filter((p) => !!p)
		.sort((a,b)=> (a.x || 0) - (b.x || 0))
}

// convert the partner names into corresponding tree nodes
export function getD3PartnerLinkNodes(flattenNodes: HierarchyNode<PedigreeDatasetNode>[], partners: PedigreePartnerLink[]): D3PartnerLink[] {
	let links = [];
	for(let i=0; i< partners.length; i++)
		links.push({female: getD3NodeByName(flattenNodes, getName(partners[i].female)),
					male: getD3NodeByName(flattenNodes, getName(partners[i].male))});
	return links;
}

// get ancestors of a node
export function ancestors(dataset: PedigreeDatasetNode[], node: HierarchyNode<PedigreeDatasetNode>): PedigreeDatasetNode[] {
	let ancestors: PedigreeDatasetNode[] = [];

	function recurse(node: HierarchyNode<PedigreeDatasetNode>|PedigreeDatasetNode|undefined) {
		if (node === undefined) {
			return
		}
		let nodeData = node
		if ('data' in node) {
			nodeData = node.data;
		}
		if('mother' in nodeData && 'father' in nodeData && !('noparents' in nodeData)){
			recurse(getNodeByName(dataset, getName(nodeData.mother)));
			recurse(getNodeByName(dataset, getName(nodeData.father)));
		}
		ancestors.push(nodeData as PedigreeDatasetNode);
	}

	recurse(node);

	return ancestors;
}

// test if two nodes are consanguineous partners
export function consanguinity(node1: HierarchyNode<PedigreeDatasetNode> | undefined, node2: HierarchyNode<PedigreeDatasetNode> | undefined, dataset: PedigreeDatasetNode[]): boolean {
	if (!node1 || !node2) {
		return false
	}

	if(node1.depth !== node2.depth) {
		// parents at different depths
		return true;
	}

	let ancestors1 = ancestors(dataset || [], node1);
	let ancestors2 = ancestors(dataset || [], node2);

	let names1 = ancestors1.map((ancestor) => ancestor.name);
	let names2 = ancestors2.map((ancestor) => ancestor.name);

	for (let i = 0; i < names1.length; i++) {
		if (names2.includes(names1[i])) {
			return true
		}
	}

	return false
}

// return a flattened representation of the tree
export function flatten(root: PedigreeDatasetNode) {
	let flat: PedigreeDatasetNode[] = [];

	function recurse(node: PedigreeDatasetNode) {
		if(node.children)
			node.children.forEach(recurse);
		flat.push(node);
	}

	recurse(root);

	return flat;
}

// return a flattened D3 representation of the tree
export function flattenD3(root: HierarchyNode<PedigreeDatasetNode>) {
	let flat: HierarchyNode<PedigreeDatasetNode>[] = [];

	function recurse(node: HierarchyNode<PedigreeDatasetNode>) {
		if(node.children)
			node.children.forEach(recurse);
		flat.push(node);
	}

	recurse(root);

	return flat;
}

// Adjust D3 layout positioning.
// Position hidden parent node centring them between father and mother nodes. Remove kinks
// from links - e.g. where there is a single child plus a hidden child
export function adjustNodesCoordinates(opts: Options, root: HierarchyNode<PedigreeDatasetNode>, flattenNodes: HierarchyNode<PedigreeDatasetNode>[]) {
	function recurse(node: HierarchyNode<PedigreeDatasetNode>) {
		if (node.children) {
			node.children.forEach(recurse);


			if(node.data.father === undefined || node.data.mother === undefined) {
				// hidden root node
				return
			}

			let father = getD3NodeByName(flattenNodes, getName(node.data.father));
			let mother = getD3NodeByName(flattenNodes, getName(node.data.mother));
			if (!father || !mother) {
				return
			}

			father.x = father.x || 0
			mother.x = mother.x || 0
			node.x = node.x || 0

			let xMiddle = (father.x + mother.x) / 2;

			if(!horizontalOverlap(opts, root.descendants(), xMiddle, node.depth, [node.data.name])) {
				node.x = xMiddle;   // centralise parent nodes
				let diff = node.x - xMiddle;
				if(node.children.length === 2 && (node.children[0].data.hidden || node.children[1].data.hidden)) {
					if(!node.children[0].data.hidden && !node.children[1].data.hidden) {
						let child1 = node.children[0];
						let child2 = node.children[1];
						child1.x = child1.x || 0
						child2.x = child2.x || 0
						if( ((child1.x < child2.x && xMiddle < child2.x) || (child1.x > child2.x && xMiddle > child2.x)) &&
							!horizontalOverlap(opts, root.descendants(), xMiddle, child1.depth, [child1.data.name])){
							child1.x = xMiddle;
						}
					}
				} else if(node.children.length === 1 && !node.children[0].data.hidden) {
					// Here we want to place the only child in the middle of the parents (xMiddle)
					// We check if there is not something in the way at its depth
					if(!horizontalOverlap(opts, root.descendants(), xMiddle, node.children[0].depth, [node.children[0].data.name])) {
						node.children[0].x = xMiddle;
					}
				} else {
					if(diff !== 0 && !nodesOverlap(opts, node, diff, root)){
						if(node.children.length === 1) {
							node.children[0].x = xMiddle;
						} else {
							let descendants = node.descendants();
							if(opts.DEBUG) {
								console.log('ADJUSTING ' + node.data.name + ' NO. DESCENDANTS ' + descendants.length + ' diff=' + diff);
							}
							for(let i=0; i<descendants.length; i++) {
								if(node.data.name !== descendants[i].data.name) {
									descendants[i].x = (descendants[i].x ||0) - diff;
								}
							}
						}
					}
				}
			} else if((node.x < father.x && node.x < mother.x) || (node.x > father.x && node.x > mother.x)){
				node.x = xMiddle;   // centralise parent node if it doesn't lie between mother and father
			}
		}
	}

	recurse(root);
	//recurse(root);
}

// test if moving siblings by diff overlaps with other nodes
function nodesOverlap(opts: Options, node: HierarchyNode<PedigreeDatasetNode>, diff: number, root: HierarchyNode<PedigreeDatasetNode>) {
	let descendants = node.descendants();
	let descendantsNames = descendants.map((descendant) => descendant.data.name);
	let nodes = root.descendants();
	for(let i=0; i<descendants.length; i++){
		let descendant = descendants[i];
		if(node.data.name !== descendant.data.name){
			let xnew = (descendant.x || 0) - diff;
			if(horizontalOverlap(opts, nodes, xnew, descendant.depth, descendantsNames))
				return true;
		}
	}
	return false;
}

// test if x position overlaps a node at the same depth
export function horizontalOverlap(opts: Options, nodes: HierarchyNode<PedigreeDatasetNode>[], xnew: number, depth: number, exclude_names: string[]) {
	const horizontalOverlapToleranceMargin = 1
	for (let n=0; n < nodes.length; n++) {
		if (depth !== nodes[n].depth) {
			// Not the same depth, horizontal overlap not possible
			continue
		}

		if(exclude_names.includes(nodes[n].data.name)) {
			// Node is excluded, we skip it
			continue
		}

		if(Math.abs(xnew - (nodes[n].x || 0)) < (opts.symbol_size * horizontalOverlapToleranceMargin)) {
			return true
		}
	}
	return false;
}

// given a persons name return the corresponding d3 tree node
export function getNodeByName(nodes: HierarchyNode<PedigreeDatasetNode>[]|PedigreeDatasetNode[], name?: string):  HierarchyNode<PedigreeDatasetNode> | PedigreeDatasetNode | undefined {
	if (!name) {
		return undefined
	}
	for (let i = 0; i < nodes.length; i++) {
		if(getNodeName(nodes[i]) === name) {
			return nodes[i];
		}
	}
}
// given a persons name return the corresponding d3 tree node
export function getPedigreeNodeByName(nodes: PedigreeDatasetNode[], name?: string):  PedigreeDatasetNode | undefined {
	if (!name) {
		return undefined
	}
	for (let i = 0; i < nodes.length; i++) {
		if(getNodeName(nodes[i]) === name) {
			return nodes[i];
		}
	}
}

export function getD3NodeByName(nodes: HierarchyNode<PedigreeDatasetNode>[], name?: string): HierarchyNode<PedigreeDatasetNode> | undefined {
	if (!name) {
		return undefined
	}
	for (let i = 0; i < nodes.length; i++) {
		if(getNodeName(nodes[i]) === name) {
			return nodes[i];
		}
	}
}

export function getNodeName<T extends (HierarchyNode<PedigreeDatasetNode>|PedigreeDatasetNode)>(node: T): string {
	if ('data' in node) {
		return node.data.name
	}

	return node.name
}

// given the name of a url param get the value
export function urlParam(name: string){
	let results = new RegExp('[?&]' + name + '=([^&#]*)').exec(window.location.href);
	if (results===null)
	   return null;
	else
	   return results[1] || 0;
}

// get grandparents index
function getGrandparentsIdx(dataset: PedigreeDatasetNode[], midx: number, fidx: number) {
	let grandMotherIdx = midx;
	let grandFatherIdx = fidx;
	while('mother' in dataset[grandMotherIdx] && 'mother' in dataset[grandFatherIdx] &&
		!('noparents' in dataset[grandMotherIdx]) && !('noparents' in dataset[grandFatherIdx])
		){
		const grandMaMotherName = getName(dataset[grandMotherIdx].mother!)
		const grandPaMotherName = getName(dataset[grandFatherIdx].mother!)

		if (grandMaMotherName === undefined || grandPaMotherName === undefined) {
			continue
		}
		grandMotherIdx = getIdxByName(dataset, grandMaMotherName);
		grandFatherIdx = getIdxByName(dataset, grandPaMotherName);
	}
	return {'midx': grandMotherIdx, 'fidx': grandFatherIdx};
}

export function getName(person?: PedigreeDatasetNode|string): string {
	if (person === undefined) {
		return ''
	}

	if (typeof person === 'string') {
		return person as string
	}

	return person.name
}

// check by name if the individual exists
export function exists(opts: Options, name: string){
	return getNodeByName(pedcache.current(opts), name) !== undefined;
}

// print options and dataset
export function print_opts(opts: Options){
	document.getElementById("pedigree_data")?.remove();
	document.querySelector("body")?.append("<div id='pedigree_data'></div>");

	let key;
	if (!opts.dataset) {
		return
	}
	for(let i=0; i < opts.dataset.length; i++) {
		const person = opts.dataset[i]
		let personTag = "<div class='row'><strong class='col-md-1 text-right'>"+person.name+"</strong><div class='col-md-11'>";
		for(key in person) {
			if (!person.hasOwnProperty(key) || key === undefined) {
				continue;
			}

			if(key === 'name') {
				continue;
			}
			//if(key === 'parent') {
			//	personTag += "<span>" + key + ":" + person.parent.name + "; </span>"
			//}
			if (key === 'children') {
				if (person.children?.[0] !== undefined) {
					personTag += "<span>" + key + ":" + person.children?.[0].name + "; </span>";
				}
				continue
			}

			personTag += "<span>"+key + ":" + person[(key as keyof PedigreeDatasetNode)]+"; </span>";
		}
		document.getElementById("pedigree_data")?.append(personTag + "</div></div>");

	}
	document.getElementById("pedigree_data")?.append("<br /><br />");
	for(key in opts) {
		if (!opts.hasOwnProperty(key) || key === undefined) {
			continue;
		}

		if(key === 'dataset') {
			continue;
		}

		document.getElementById("pedigree_data")?.append("<span>"+key + ":" + opts[(key as keyof Options)]+"; </span>");
	}
}

export function is_fullscreen(){
	return (document.fullscreenElement)// || document.mozFullScreenElement || document.webkitFullscreenElement || document.msFullscreenElement);
}


export function get_svg_dimensions(opts: Options) {
	return {width: (is_fullscreen()? window.innerWidth  : opts.width),
			height: (is_fullscreen()? window.innerHeight : opts.height)};
}

export function get_tree_dimensions(opts: Options) {
	// / get score at each depth used to adjust node separation
	let {width: svgWidth, height: svgHeight} = get_svg_dimensions(opts);
	let maxScore = 0;
	let generation: Record<number, number> = {};

	for(let i=0; opts.dataset !== undefined && i < opts.dataset.length; i++) {
		let depth = getDepth(opts.dataset, opts.dataset[i].name);
		let children = getAllChildren(opts.dataset, opts.dataset[i]);

		// score based on no. of children and if parent defined
		let score = 1 + (children.length > 0 ? 0.55 + (children.length * 0.25) : 0) + (opts.dataset[i].father ? 0.25 : 0);

		if(depth in generation) {
			generation[depth] += score;
		} else {
			generation[depth] = score;
		}

		if(generation[depth] > maxScore)
			maxScore = generation[depth];
	}

	let max_depth = Object.keys(generation).length * opts.symbol_size * 3.5;
	let tree_width =  (svgWidth - opts.symbol_size > maxScore * opts.symbol_size * 1.65 ?
					   svgWidth - opts.symbol_size : maxScore * opts.symbol_size * 1.65);
	let tree_height = (svgHeight - opts.symbol_size > max_depth ?
					   svgHeight - opts.symbol_size : max_depth);

	return {
		width: tree_width,
		height: tree_height
	};
}

