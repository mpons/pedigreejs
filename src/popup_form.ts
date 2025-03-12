/**
/* © 2023 University of Cambridge
/* SPDX-FileCopyrightText: 2023 University of Cambridge
/* SPDX-License-Identifier: GPL-3.0-or-later
**/

// pedigree form
import {syncTwins} from './twins.js';
import {copy_dataset, getNodeByName, getPedigreeNodeByName} from './utils.js';
import {current as pedcache_current} from './pedcache.js';
import {PedigreeDatasetNode} from "@/models/PedigreeDatasetNode.ts";
import {Options} from "@/models/Options.ts";
import {Sex} from "@/models/Types/Sex.ts";
import {rebuild} from "@/pedigree.ts";


// handle family history change events (undo/redo/delete)
document.addEventListener('fhChange', function(e: Event) {
	try {
		const customEvent = e as CustomEvent<Options>;
		const opts = customEvent.detail;
		const idNameField = document.getElementById('id_name') as HTMLInputElement;
		const id = idNameField.value;  // get name from hidden field
		const node = getNodeByName(pedcache_current(opts), id);

		const formFieldsets = document.querySelectorAll('form > fieldset');
		if(node === undefined) {
			formFieldsets.forEach(fieldset => {
				fieldset.setAttribute("disabled", "true");
			});
		} else {
			formFieldsets.forEach(fieldset => {
				fieldset.removeAttribute("disabled");
			});
		}
	} catch(err) {
		console.warn(err);
	}
});

// update status field and age label - 0 = alive, 1 = dead
export function updateStatus(status: string): void {
	const ageLockElement = document.getElementById('age_yob_lock');
	if (ageLockElement) {
		ageLockElement.classList.remove('fa-lock', 'fa-unlock-alt');
		ageLockElement.classList.add(status === "1" ? 'fa-unlock-alt' : 'fa-lock');
	}

	const ageActiveElement = document.getElementById('id_age_' + status);
	const ageInactiveElement = document.getElementById('id_age_' + (status === "1" ? '0' : '1'));

	if (ageActiveElement) ageActiveElement.classList.remove("hidden");
	if (ageInactiveElement) ageInactiveElement.classList.add("hidden");
}

export function nodeclick(node: PedigreeDatasetNode): void {
	// Enable form fieldsets
	const formFieldsets = document.querySelectorAll('form > fieldset');
	formFieldsets.forEach(fieldset => {
		fieldset.removeAttribute("disabled");
	});

	// clear values
	const textInputs = document.querySelectorAll('#person_details input[type=text], #person_details input[type=number]');
	textInputs.forEach(input => {
		(input as HTMLInputElement).value = "";
	});

	const selects = document.querySelectorAll('#person_details select');
	selects.forEach(select => {
		(select as HTMLSelectElement).value = '';
	});

	// assign values to input fields in form
	if(node.sex === 'M' || node.sex === 'F') {
		const sexRadio = document.querySelector(`input[name=sex][value="${node.sex}"]`) as HTMLInputElement;
		if (sexRadio) sexRadio.checked = true;
	} else {
		const sexRadios = document.querySelectorAll('input[name=sex]');
		sexRadios.forEach(radio => {
			(radio as HTMLInputElement).checked = false;
		});
	}
	update_cancer_by_sex(node);


	const statusRadio = document.querySelector(`input[name=status][value="${node.status}"]`) as HTMLInputElement;
	if (statusRadio) statusRadio.checked = true;

	// show lock symbol for age and yob synchronisation
	updateStatus(node.status);

	const probandCheckbox = document.getElementById('id_proband') as HTMLInputElement;
	if('proband' in node) {
		probandCheckbox.checked = !!node.proband;
		probandCheckbox.disabled = true;
	} else {
		probandCheckbox.checked = false;
		probandCheckbox.disabled = !('yob' in node);
	}

	const excludeCheckbox = document.getElementById('id_exclude') as HTMLInputElement;
	if('exclude' in node) {
		excludeCheckbox.checked = !!node.exclude;
	} else {
		excludeCheckbox.checked = false;
	}

	// year of birth
	const yobInput = document.getElementById('id_yob_0') as HTMLInputElement;
	if('yob' in node) {
		yobInput.value = String(node.yob);
	} else {
		yobInput.value = '-';
	}

	// clear pathology
	const pathologySelects = document.querySelectorAll('select[name$="_bc_pathology"]');
	pathologySelects.forEach(select => {
		(select as HTMLSelectElement).value = '-';
	});

	// clear gene tests
	const geneTestSelects = document.querySelectorAll('select[name*="_gene_test"]');
	geneTestSelects.forEach(select => {
		(select as HTMLSelectElement).value = '-';
	});

	// disable sex radio buttons if the person has a partner
	const sexRadios = document.querySelectorAll("input[id^='id_sex_']");
	sexRadios.forEach(radio => {
		(radio as HTMLInputElement).disabled = !!(node.parent_node && node.sex !== 'U');
	});

	// disable pathology for male relatives (as not used by model)
	// and if no breast cancer age of diagnosis
	const pathologyElements = document.querySelectorAll("select[id$='_bc_pathology']");
	pathologyElements.forEach(element => {
		(element as HTMLSelectElement).disabled = (
			node.sex === 'M' ||
			(node.sex === 'F' && !('breast_cancer_diagnosis_age' in node))
		);
	});

	// approximate diagnosis age
	const approxCheckbox = document.getElementById('id_approx') as HTMLInputElement;
	approxCheckbox.checked = !!node.approx_diagnosis_age;
	update_diagnosis_age_widget();

	for(let key in node) {
		if(key !== 'proband' && key !== 'sex') {
			const element = document.getElementById('id_' + key);
			if(element) {  // input value
				if(key.indexOf('_gene_test') !== -1 && node[key] !== null && typeof node[key] === 'object') {
					(element as HTMLSelectElement).value = node[key].type;

					const resultElement = document.getElementById('id_' + key + '_result') as HTMLSelectElement;
					if (resultElement) {
						resultElement.value = node[key].result;
					}
				} else {
					(element as HTMLInputElement).value = node[key];
				}
			} else if(key.indexOf('_diagnosis_age') !== -1) {
				if(approxCheckbox.checked) {
					const ageElement = document.getElementById('id_' + key + '_1') as HTMLSelectElement;
					if (ageElement) {
						ageElement.value = String(round5(node[key]));
					}
				} else {
					const ageElement = document.getElementById('id_' + key + '_0') as HTMLInputElement;
					if (ageElement) {
						ageElement.value = node[key];
					}
				}
			}
		}
	}

	try {
		const form = document.querySelector('#person_details form') as HTMLFormElement;
		if (form && typeof form.checkValidity === 'function') {
			form.checkValidity();
		}
	} catch(err) {
		console.warn('checkValidity() not found');
	}
}

function update_ashkn(newdataset: PedigreeDatasetNode[]): void {
	// Ashkenazi status, 0 = not Ashkenazi, 1 = Ashkenazi
	const origAshkCheckbox = document.getElementById('orig_ashk') as HTMLInputElement;

	if(origAshkCheckbox && origAshkCheckbox.checked) {
		newdataset.forEach(p => {
			if(p.proband) {
				p.ashkenazi = true;
			}
		});
	} else {
		newdataset.forEach(p => {
			p.ashkenazi = false;
		});
	}
}

// Save Ashkenazi status
export function save_ashkn(opts: any): void {
	const dataset = pedcache_current(opts);
	const newdataset = copy_dataset(dataset);
	update_ashkn(newdataset);
	opts.dataset = newdataset;
	document.dispatchEvent(new CustomEvent('rebuild', { detail: opts }));
}

export function save(opts: Options): void {
	const dataset = pedcache_current(opts);
	const nameInput = document.getElementById('id_name') as HTMLInputElement;
	const name = nameInput.value;
	const newdataset = copy_dataset(dataset);
	const person = getPedigreeNodeByName(newdataset, name);

	if(!person) {
		console.warn('person not found when saving details');
		return;
	}

	const targetDiv = document.getElementById(opts.targetDiv);
	if (targetDiv) {
		while (targetDiv.firstChild) {
			targetDiv.removeChild(targetDiv.firstChild);
		}
	}

	// individual's personal and clinical details
	const yobInput = document.getElementById('id_yob_0') as HTMLInputElement|null;
	const yob = yobInput?.value;
	if(yob && yob !== '') {
		person.yob = Number(yob);
	} else {
		delete person.yob;
	}

	// current status: 0 = alive, 1 = dead
	const statusChecked = document.querySelector('#id_status input[type="radio"]:checked') as HTMLInputElement|null;
	if(statusChecked) {
		person.status = statusChecked.value as '1'|'0';
	}

	// boolean switches
	const switches = ["miscarriage", "adopted_in", "adopted_out", "termination", "stillbirth"];
	for(let iswitch=0; iswitch<switches.length; iswitch++) {
		const attr = switches[iswitch];
		const switchElement = document.getElementById('id_' + attr) as HTMLInputElement|null;
		if(switchElement) {
			console.log(switchElement.checked);
			if(switchElement.checked) {
				person[attr] = true;
			} else {
				delete person[attr];
			}
		}
	}

	// current sex
	const sexChecked = document.querySelector('#id_sex input[type="radio"]:checked') as HTMLInputElement|null;
	if(sexChecked) {
		person.sex = sexChecked.value as Sex;
		update_cancer_by_sex(person);
	}

	// Ashkenazi status, 0 = not Ashkenazi, 1 = Ashkenazi
	update_ashkn(newdataset);

	// approximate diagnosis age
	const approxCheckbox = document.getElementById('id_approx') as HTMLInputElement|null;
	if(approxCheckbox?.checked) {
		person.approx_diagnosis_age = true;
	} else {
		delete person.approx_diagnosis_age;
	}

	// Get all visible diagnosis age selects and text/number inputs
	const visibleInputs = Array.from(document.querySelectorAll(
		"#person_details select[name*='_diagnosis_age']:not([style*='display: none']), " +
		"#person_details input[type=text]:not([style*='display: none']), " +
		"#person_details input[type=number]:not([style*='display: none'])"
	));

	visibleInputs.forEach(element => {
		const input = element as HTMLInputElement | HTMLSelectElement;
		let name = input.name;
		if (name.indexOf("_diagnosis_age") > -1) {
			name = name.substring(0, name.length-2);
		}

		if(input.value) {
			let val = input.value;
			if(name.indexOf("_diagnosis_age") > -1 && approxCheckbox?.checked) {
				val = String(round5(val));
			}
			person[name] = val;
		} else {
			delete person[name];
		}
	});

	// cancer checkboxes
	const cancerCheckboxes = document.querySelectorAll(
		'#person_details input[type="checkbox"][name$="cancer"], ' +
		'#person_details input[type="checkbox"][name$="cancer2"]'
	);

	cancerCheckboxes.forEach(element => {
		const checkbox = element as HTMLInputElement;
		if(checkbox.checked) {
			person[checkbox.name] = true;
		} else {
			delete person[checkbox.name];
		}
	});

	// pathology tests
	const pathologySelects = document.querySelectorAll('#person_details select[name$="_bc_pathology"]');
	pathologySelects.forEach(element => {
		const select = element as HTMLSelectElement;
		if(select.value !== '-') {
			person[select.name] = select.value;
		} else {
			delete person[select.name];
		}
	});

	// genetic tests
	const geneTestSelects = document.querySelectorAll('#person_details select[name$="_gene_test"]');
	geneTestSelects.forEach(element => {
		const select = element as HTMLSelectElement;
		if(select.value !== '-') {
			const resultSelect = document.querySelector(`select[name="${select.name}_result"]`) as HTMLSelectElement;
			person[select.name] = {'type': select.value, 'result': resultSelect.value};
		} else {
			delete person[select.name];
		}
	});

	// record HOXB13 genetic test
	const hoxb13ResultSelect = document.querySelector('#person_details select[name="hoxb13_gene_test_result"]') as HTMLSelectElement;
	if(hoxb13ResultSelect && hoxb13ResultSelect.value !== undefined && hoxb13ResultSelect.value !== '-') {
		person["hoxb13_gene_test"] = {'type': 'T', 'result': hoxb13ResultSelect.value};  // assume direct test
	} else {
		delete person["hoxb13_gene_test"];
	}

	try {
		const form = document.querySelector('#person_details form') as HTMLFormElement;
		if (form && typeof form.checkValidity === 'function') {
			form.checkValidity();
		}
	} catch(err) {
		console.warn('checkValidity() not found');
	}

	syncTwins(newdataset, person);
	opts.dataset = newdataset;
	if (typeof opts.onChange === 'function') {
		opts.onChange(opts.dataset);
	}
	rebuild(opts)
}

export function update_diagnosis_age_widget(): void {
	const approxCheckbox = document.getElementById('id_approx') as HTMLInputElement;

	if(approxCheckbox.checked) {
		// Get all exact age inputs
		const exactAgeInputs = document.querySelectorAll("[id$='_diagnosis_age_0']");
		exactAgeInputs.forEach(element => {
			const input = element as HTMLInputElement;
			if(input.value !== '') {
				const name = input.name.substring(0, input.name.length-2);
				const approxSelect = document.getElementById("id_" + name + "_1") as HTMLSelectElement;
				if (approxSelect) {
					approxSelect.value = String(round5(input.value));
				}
			}
			input.style.display = 'none';
		});

		// Show approximate age selects
		const approxAgeSelects = document.querySelectorAll("[id$='_diagnosis_age_1']");
		approxAgeSelects.forEach(element => {
			(element as HTMLElement).style.display = 'block';
		});
	} else {
		// Get all approximate age selects
		const approxAgeSelects = document.querySelectorAll("[id$='_diagnosis_age_1']");
		approxAgeSelects.forEach(element => {
			const select = element as HTMLSelectElement;
			if(select.value !== '') {
				const name = select.name.substring(0, select.name.length-2);
				const exactInput = document.getElementById("id_" + name + "_0") as HTMLInputElement;
				if (exactInput) {
					exactInput.value = select.value;
				}
			}
			select.style.display = 'none';
		});

		// Show exact age inputs
		const exactAgeInputs = document.querySelectorAll("[id$='_diagnosis_age_0']");
		exactAgeInputs.forEach(element => {
			(element as HTMLElement).style.display = 'block';
		});
	}
}

// males should not have ovarian cancer and females should not have prostate cancer
function update_cancer_by_sex(node: PedigreeDatasetNode): void {
	// Show all cancer rows
	const cancerRows = document.querySelectorAll('#cancer .row');
	cancerRows.forEach(row => {
		(row as HTMLElement).style.display = 'block';
	});

	if(node.sex === 'M') {
		delete node.ovarian_cancer_diagnosis_age;

		// Hide ovarian cancer rows
		const ovarianRows = document.querySelectorAll("[id^='id_ovarian_cancer_diagnosis_age']");
		ovarianRows.forEach(element => {
			const row = (element as HTMLElement).closest('.row') as HTMLElement;
			if (row) {
				row.style.display = 'none';
			}
		});

		// Disable breast cancer 2
		const breastCancer2Inputs = document.querySelectorAll("[id^='id_breast_cancer2_diagnosis_age']");
		breastCancer2Inputs.forEach(input => {
			(input as HTMLElement).setAttribute('disabled', 'true');
		});
	} else if(node.sex === 'F') {
		delete node.prostate_cancer_diagnosis_age;

		// Hide prostate cancer rows
		const prostateRows = document.querySelectorAll("[id^='id_prostate_cancer_diagnosis_age']");
		prostateRows.forEach(element => {
			const row = (element as HTMLElement).closest('.row') as HTMLElement;
			if (row) {
				row.style.display = 'none';
			}
		});

		// Enable breast cancer 2
		const breastCancer2Inputs = document.querySelectorAll("[id^='id_breast_cancer2_diagnosis_age']");
		breastCancer2Inputs.forEach(input => {
			(input as HTMLElement).removeAttribute('disabled');
		});
	}
}

// round to 5, 15, 25, 35 ....
function round5(x1: string | number): number {
	const num = typeof x1 === 'string' ? parseFloat(x1) : x1;
	const x2 = (Math.round((num-1) / 10) * 10);
	return (num < x2 ? x2 - 5 : x2 + 5);
}


