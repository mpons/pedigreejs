/**
/* © 2023 University of Cambridge
/* SPDX-FileCopyrightText: 2023 University of Cambridge
/* SPDX-License-Identifier: GPL-3.0-or-later
**/

import * as pedigree_util from './utils.ts';
import {PedigreeDatasetNode} from "@/models/PedigreeDatasetNode.ts";
import {PolygenicRiskScore} from "@/models/PolygenicRiskScore.ts";
import {Sex} from "@/models/Types/Sex.ts";
import { getName } from './utils.ts';
import {PedigreeGeneTestsResults} from "@/models/PedigreeGeneTestsResults.ts";

// Define interfaces for better type safety
interface CancerMap {
	[key: string]: string;
}


// cancers, genetic & pathology tests
export const cancers: CancerMap = {
	'breast_cancer': 'breast_cancer_diagnosis_age',
	'breast_cancer2': 'breast_cancer2_diagnosis_age',
	'ovarian_cancer': 'ovarian_cancer_diagnosis_age',
	'prostate_cancer': 'prostate_cancer_diagnosis_age',
	'pancreatic_cancer': 'pancreatic_cancer_diagnosis_age'
};

export const genetic_test1: string[] = ['brca1', 'brca2', 'palb2', 'atm', 'chek2', 'rad51d', 'rad51c', 'brip1'];
export const genetic_test2: string[] = ['brca1', 'brca2', 'palb2', 'atm', 'chek2', 'bard1', 'rad51d', 'rad51c', 'brip1'];
export const genetic_test4: string[] = ['brca1', 'brca2', 'palb2', 'atm', 'chek2', 'bard1', 'rad51d', 'rad51c', 'brip1', 'hoxb13'];

export const pathology_tests: string[] = ['er', 'pr', 'her2', 'ck14', 'ck56'];

// risk factor to storage
const RISK_FACTOR_STORE: {[key: string]: any} = {};

// get surgical ops and PRS for canrisk header
export function get_meta(): string {
	let meta: string = get_surgical_ops();
	let prs: PolygenicRiskScore | undefined;
	try {
		prs = get_prs_values();
		if(prs && prs.breast_cancer_prs && prs.breast_cancer_prs.alpha !== 0 && prs.breast_cancer_prs.zscore !== 0) {
			meta += "\n##PRS_BC=alpha="+prs.breast_cancer_prs.alpha+",zscore="+prs.breast_cancer_prs.zscore;
		}

		if(prs && prs.ovarian_cancer_prs && prs.ovarian_cancer_prs.alpha !== 0 && prs.ovarian_cancer_prs.zscore !== 0) {
			meta += "\n##PRS_OC=alpha="+prs.ovarian_cancer_prs.alpha+",zscore="+prs.ovarian_cancer_prs.zscore;
		}

		if(prs && prs.prostate_cancer_prs && prs.prostate_cancer_prs.alpha !== 0 && prs.prostate_cancer_prs.zscore !== 0) {
			meta += "\n##PRS_PC=alpha="+prs.prostate_cancer_prs.alpha+",zscore="+prs.prostate_cancer_prs.zscore;
		}
	} catch(err) { console.warn("PRS", prs); }
	return meta;
}

// return a non-anonimised pedigree format
export function get_non_anon_pedigree(dataset: PedigreeDatasetNode[], meta?: string, version: number = 2, ethnicity?: string): string {
	return get_pedigree(dataset, undefined, meta, false, version, ethnicity);
}

//check if input has a value
export function hasInput(id: string): boolean {
	const element = document.getElementById(id) as HTMLInputElement | null;
	const v = element ? element.value : '';
	return v.trim().length !== 0;
}

//return true if the object is empty
const isEmpty = function<T>(myObj: T): boolean {
	for(const key in myObj) {
		if (Object.prototype.hasOwnProperty.call(myObj, key)) {
			return false;
		}
	}
	return true;
}

//get breast and ovarian PRS values
export function get_prs_values(): PolygenicRiskScore | undefined {
	const prs: PolygenicRiskScore = {};
	if(hasInput("breast_prs_a") && hasInput("breast_prs_z")) {
		const breastPrsA = document.getElementById('breast_prs_a') as HTMLInputElement;
		const breastPrsZ = document.getElementById('breast_prs_z') as HTMLInputElement;
		const breastPrsPercent = document.getElementById('breast_prs_percent') as HTMLInputElement;

		prs.breast_cancer_prs = {
			alpha: parseFloat(breastPrsA.value),
			zscore: parseFloat(breastPrsZ.value),
			percent: parseFloat(breastPrsPercent.value)
		};
	}
	if(hasInput("ovarian_prs_a") && hasInput("ovarian_prs_z")) {
		const ovarianPrsA = document.getElementById('ovarian_prs_a') as HTMLInputElement;
		const ovarianPrsZ = document.getElementById('ovarian_prs_z') as HTMLInputElement;
		const ovarianPrsPercent = document.getElementById('ovarian_prs_percent') as HTMLInputElement;

		prs.ovarian_cancer_prs = {
			alpha: parseFloat(ovarianPrsA.value),
			zscore: parseFloat(ovarianPrsZ.value),
			percent: parseFloat(ovarianPrsPercent.value)
		};
	}
	if(hasInput("prostate_prs_a") && hasInput("prostate_prs_z")) {
		const prostatePrsA = document.getElementById('prostate_prs_a') as HTMLInputElement;
		const prostatePrsZ = document.getElementById('prostate_prs_z') as HTMLInputElement;
		const prostatePrsPercent = document.getElementById('prostate_prs_percent') as HTMLInputElement;

		prs.prostate_cancer_prs = {
			alpha: parseFloat(prostatePrsA.value),
			zscore: parseFloat(prostatePrsZ.value),
			percent: parseFloat(prostatePrsPercent.value)
		};
	}
	console.log(prs);
	return (isEmpty(prs) ? undefined : prs);
}

function get_surgical_ops(): string {
	let meta: string = "";
	const ovaryElement = document.getElementById('A6_4_3_check');
	const mastElement = document.getElementById('A6_4_7_check');

	if(ovaryElement && !ovaryElement.parentElement?.classList.contains("off")) {
		meta += ";OVARY2=y";
	}
	if(mastElement && !mastElement.parentElement?.classList.contains("off")) {
		meta += ";MAST2=y";
	}
	return meta;
}

/**
 * Get genetic test genes based on CanRisk version
 */
function getGeneticTest(version: number): string[] {
	version = parseInt(version.toString());
	if(version === 1)
		return genetic_test1;
	else if(version === 2)
		return genetic_test2;
	else if(version === 3)
		return genetic_test2;
	return genetic_test4;
}

export function readCanRisk(boadicea_lines: string): [string[], PedigreeDatasetNode[]] {
	const lines: string[] = boadicea_lines.trim().split('\n');
	const ped: PedigreeDatasetNode[] = [];
	const hdr: string[] = [];  // collect risk factor header lines
	const regexp = /([0-9])/;
	let version: number = 3;
	let gt: string[] = getGeneticTest(version);
	const ncol: number[] = [26, 27, 27, 28];    // number of columns - v1, v2, v3, v4
	// assumes two line header
	for(let i = 0; i < lines.length; i++) {
		const ln: string = lines[i].trim();
		if(ln.indexOf("##") === 0) {
			if(ln.indexOf("##CanRisk") === 0) {
				const match = ln.match(regexp);
				if (match) {
					version = parseInt(match[1]);
					gt = getGeneticTest(version);
					console.log("CanRisk File Format version "+version);
				}

				if(ln.indexOf(";") > -1) {   // contains surgical op data
					const ops: string[] = ln.split(";");
					for(let j=1; j<ops.length; j++) {
						const opdata: string[] = ops[j].split("=");
						if(opdata.length === 2) {
							hdr.push(ops[j]);
						}
					}
				}
			}
			if(ln.indexOf("CanRisk") === -1 && ln.indexOf("##FamID") !== 0) {
				hdr.push(ln.replace("##", ""));
			}
			continue;
		}

		let delim = /\t/;
		if(ln.indexOf('\t') < 0) {
			delim = /\s+/;
			console.log("NOT TAB DELIM");
		}
		const attr: string[] = ln.split(delim).map((val: string) => val.trim());

		if(attr.length > 1) {
			if(attr.length !== ncol[version-1]) {
				console.error(ln, attr);
				throw new Error('Found number of columns '+attr.length+'; expected '+ncol[version-1]+' for CanRisk version '+version);
			}
			const indi: PedigreeDatasetNode = {
				famid: attr[0],
				display_name: attr[1],
				name: attr[3],
				sex: attr[6] as Sex,
				status: attr[8] as '1'|'0',
				proband: false,
				parent: null,
				ashkenazi: false
			};
			if(attr[2] === "1") indi.proband = true;
			if(attr[4] !== "0") indi.father = attr[4];
			if(attr[5] !== "0") indi.mother = attr[5];
			if(attr[7] !== "0") indi.mztwin = attr[7];
			if(attr[9] !== "0") indi.age = parseInt(attr[9]);
			if(attr[10] !== "0") indi.yob = parseInt(attr[10]);

			let idx: number = 11;
			Object.keys(cancers).forEach((cancer: string) => {
				const diagnosis_age: string = cancers[cancer];
				// Age at 1st cancer or 0 = unaffected, AU = unknown age at diagnosis (affected unknown)
				if(attr[idx] !== "0") {
					indi[diagnosis_age as keyof PedigreeDatasetNode] = attr[idx];
				}
				idx++;
			});

			if(attr[idx++] !== "0") indi.ashkenazi = true;
			// BRCA1, BRCA2, PALB2, ATM, CHEK2, .... genetic tests
			// genetic test type, 0 = untested, S = mutation search, T = direct gene test
			// genetic test result, 0 = untested, P = positive, N = negative
			for(let j=0; j<gt.length; j++) {
				const gene_test: string[] = attr[idx].split(":");
				if(gene_test[0] !== '0') {
					if((gene_test[0] === 'S' || gene_test[0] === 'T') && (gene_test[1] === 'P' || gene_test[1] === 'N')) {
						indi[(gt[j] + '_gene_test') as keyof PedigreeDatasetNode] = {
							'type': gene_test[0],
							'result': gene_test[1]
						};
					} else {
						console.warn('UNRECOGNISED GENE TEST ON LINE ' + (i + 1) + ": " + gene_test[0] + " " + gene_test[1]);
					}
				} else {
					if(gene_test[1] === 'P' || gene_test[1] === 'N')
						indi[gt[j] + '_gene_test'] = {'type': gene_test[0], 'result': gene_test[1]};
				}
				idx++;
			}
			// status, 0 = unspecified, N = negative, P = positive
			const path_test: string[] = attr[idx].split(":");
			for(let j=0; j<path_test.length; j++) {
				if(path_test[j] !== '0') {
					if(path_test[j] === 'N' || path_test[j] === 'P') {
						const key = pathology_tests[j] + '_bc_pathology'
						indi[key as keyof PedigreeDatasetNode] = path_test[j];
					} else {
						console.warn('UNRECOGNISED PATHOLOGY ON LINE ' + (i + 1) + ": " + pathology_tests[j] + " " + path_test[j]);
					}
				}
			}
			ped.push(indi);
		}
	}

	// group mztwins
	ped.sort((a: PedigreeDatasetNode, b: PedigreeDatasetNode) => {
		return a.mztwin !== undefined ? a.mztwin.localeCompare(b.mztwin || '') : 0;
	});

	return [hdr, ped];
}

/**
 * Get the mammographic density formatted CanRisk data file line
 */
export function get_mdensity(mdensity: string): string {
	const regexp = /^(birads|Volpara|Stratus)=/i;
	if(regexp.test(mdensity))
		return "\n##"+mdensity;

	const birads = /^(1|2|3|4|a|b|c|d)$/i
	if(birads.test(mdensity))
		return "\n##birads="+mdensity;

	console.error("Unrecognised mammographic density format :: " + mdensity);
	return ""
}

/**
 * Get CanRisk formated pedigree.
 */
export function get_pedigree(dataset: PedigreeDatasetNode[], famid?: string, meta?: string, isanon?: boolean, version: number = 3, ethnicity?: string): string {
	const v: string = (Number.isInteger(version) ? version+".0" : version.toString());
	let fileContent: string = "##CanRisk " + v;
	if(!famid) {
		famid = "XXXX";
	}
	if(meta) {
		fileContent += meta;
	}
	if(typeof isanon === 'undefined') {
		isanon = true;
	}
	// array of individuals excluded from the calculation
	const excl: string[] = dataset.filter(p => 'exclude' in p && p.exclude).map(p => p.name);

	// female risk factors
	const probandIdx = pedigree_util.getProbandIndex(dataset);
	let sex: string = 'F';
	if(probandIdx) {
		sex = dataset[probandIdx].sex;
	}

	if(sex !== 'M') {
		const menarche: any = get_risk_factor('menarche_age');
		const parity: any = get_risk_factor('parity');
		const first_birth: any = get_risk_factor('age_of_first_live_birth');
		const oc_use: any = get_risk_factor('oral_contraception');
		const mht_use: any = get_risk_factor('mht');
		const bmi: any = get_risk_factor('bmi');
		const alcohol: any = get_risk_factor('alcohol_intake');
		const menopause: any = get_risk_factor('age_of_menopause');
		const mdensity: any = get_risk_factor('mammographic_density');
		const hgt: any = get_risk_factor('height');
		const tl: any = get_risk_factor('Age_Tubal_ligation');
		const endo: any = get_risk_factor('endometriosis');

		if(menarche !== undefined)
			fileContent += "\n##menarche="+menarche;
		if(parity !== undefined)
			fileContent += "\n##parity="+parity;
		if(first_birth !== undefined)
			fileContent += "\n##first_live_birth="+first_birth;
		if(oc_use !== undefined)
			fileContent += "\n##oc_use="+oc_use;
		if(mht_use !== undefined)
			fileContent += "\n##mht_use="+mht_use;
		if(bmi !== undefined)
			fileContent += "\n##BMI="+bmi;
		if(alcohol !== undefined)
			fileContent += "\n##alcohol="+alcohol;
		if(menopause !== undefined)
			fileContent += "\n##menopause="+menopause;
		if(mdensity !== undefined)
			fileContent += get_mdensity(mdensity);
		if(hgt !== undefined)
			fileContent += "\n##height="+hgt;
		if(tl !== undefined)
			if(tl !== "n" && tl !== "N")
				fileContent += "\n##TL=Y";
			else
				fileContent += "\n##TL=N";

		if(endo !== undefined)
			fileContent += "\n##endo="+endo;
	}

	if(version > 2 && ethnicity !== undefined) {
		fileContent += "\n##ethnicity="+ethnicity;
	}
	fileContent += "\n##FamID\tName\tTarget\tIndivID\tFathID\tMothID\tSex\tMZtwin\tDead\tAge\tYob\tBC1\tBC2\tOC\tPRO\tPAN\tAshkn"

	const gt: string[] = getGeneticTest(version);
	for(let i=0; i<gt.length; i++) {
		fileContent += "\t"+gt[i].toUpperCase();
	}
	fileContent += "\tER:PR:HER2:CK14:CK56";

	for(let i=0; i<dataset.length; i++) {
		const p: PedigreeDatasetNode = dataset[i];
		if(excl.indexOf(p.name) !== -1) {
			console.log('EXCLUDE: '+p.name);
			continue;
		}

		fileContent += '\n'+famid+'\t';                                                // max 13 chars
		if(isanon)
			fileContent += i+'\t';                                                    // display_name (ANONYMISE) max 8 chars
		else
			fileContent += (p.display_name ? p.display_name : "NA")+'\t';
		fileContent += ('proband' in p ? '1' : 0)+'\t';
		fileContent += p.name+'\t';                                                    // max 7 chars
		fileContent += ('father' in p && !('noparents' in p) && (excl.indexOf(getName(p.father)) === -1)? getName(p.father) : 0)+'\t';    // max 7 chars
		fileContent += ('mother' in p && !('noparents' in p) && (excl.indexOf(getName(p.mother)) === -1)? getName(p.mother) : 0)+'\t';    // max 7 chars
		fileContent += p.sex+'\t';
		fileContent += ('mztwin' in p ? p.mztwin : 0)+'\t';                         // MZtwin
		fileContent += ('status' in p ? p.status : 0)+'\t';                            // current status: 0 = alive, 1 = dead
		fileContent += ('age' in p ? p.age : 0)+'\t';                                // Age at last follow up or 0 = unspecified
		fileContent += ('yob' in p ? p.yob : 0)+'\t';                                // YOB or 0 = unspecified

		let cmsg: string = "";
		Object.keys(cancers).forEach((cancer: string) => {
			const diagnosis_age: string = cancers[cancer];
			// Age at 1st cancer or 0 = unaffected, AU = unknown age at diagnosis (affected unknown)
			if(diagnosis_age in p)
				cmsg += (diagnosis_age in p ? p[diagnosis_age as keyof PedigreeDatasetNode] : 'AU')+'\t';
			else
				cmsg += '0\t';
		});
		fileContent+=cmsg;

		// Ashkenazi status, 0 = not Ashkenazi, 1 = Ashkenazi
		fileContent += ('ashkenazi' in p ? p.ashkenazi : 0)+'\t';

		for(let j=0; j<gt.length; j++) {
			const key = gt[j]+'_gene_test'
			if (!(key in p)) {
				fileContent += '0:0\t';
				continue
			}

			const geneTest = p[key as keyof PedigreeDatasetNode] as PedigreeGeneTestsResults

			if(	geneTest.type !== '-' && geneTest.result !== '-') {
				fileContent += geneTest.type + ':';
				fileContent += geneTest.result + '\t';
			} else {
				fileContent += '0:0\t';        // type, 0=untested, S=mutation search, T=direct gene test
				// result, 0=untested, P=positive, N=negative
			}
		}

		for(let j=0; j<pathology_tests.length; j++) {
			// status, 0 = unspecified, N = negative, P = positive
			const key = pathology_tests[j]+'_bc_pathology'
			if (!(key in p)) {
				fileContent += '0';
				continue
			}

			fileContent += p[key as keyof PedigreeDatasetNode];
			console.log('pathology '+p[key as keyof PedigreeDatasetNode]+' for '+p.display_name);

			if(j<(pathology_tests.length-1))
				fileContent += ":";
		}
	}
	console.log(fileContent, RISK_FACTOR_STORE);
	return fileContent;
}

export function show_risk_factor_store(): void {
	console.log("RISK_FACTOR_STORE::");
	Object.keys(RISK_FACTOR_STORE).forEach((name: string) => {
		console.log(name + " : " + RISK_FACTOR_STORE[name]);
	});
}

export function save_risk_factor(risk_factor_name: string, val: any): void {
	RISK_FACTOR_STORE[store_name(risk_factor_name)] = val;
}

export function get_risk_factor(risk_factor_name: string): any {
	const key: string = store_name(risk_factor_name);
	if(key in RISK_FACTOR_STORE) {
		return RISK_FACTOR_STORE[key];
	}
	return undefined;
}

// remove risk factor from storage
export function remove_risk_factor(risk_factor_name: string): void {
	delete RISK_FACTOR_STORE[store_name(risk_factor_name)];
}

// prefix risk factor name with the app/page name
export function store_name(risk_factor_name: string): string {
	return window.location.pathname.split('/').filter((el: string) => !!el).pop() +
		'::' + risk_factor_name;
}

