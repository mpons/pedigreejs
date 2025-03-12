import { Options } from "./models/Options";
import {clear, clear_pedigree_data, current, get_count, inStoreCount, next, previous} from "./pedcache";
import {build, rebuild } from "./pedigree";
import {buildPerson, copy_dataset, getProbandIndex, is_fullscreen, messages} from "./utils";
import {btn_zoom, scale_to_fit} from "./zoom";
import {PedigreeDatasetNode} from "@/models/PedigreeDatasetNode.ts";

export function addButtons(options: Options) {
    let opts = {
        ...{
            btn_target: 'pedigree_history'
        }, ...options
    };

    let btns = [{"fa": "fa-file-image", "title": "download PNG image"},
        {"fa": "fa-undo", "title": "undo"},
        {"fa": "fa-redo", "title": "redo"},
        {"fa": "fa-refresh", "title": "reset"}];

    btns.push({"fa": "fa-crosshairs", "title": "scale-to-fit"});
    if (opts.zoomSrc && (opts.zoomSrc.indexOf('button') > -1)) {
        if (opts.zoomOut !== 1)
            btns.push({"fa": "fa-minus-circle", "title": "zoom-out"});
        if (opts.zoomIn !== 1)
            btns.push({"fa": "fa-plus-circle", "title": "zoom-in"});
    }
    btns.push({"fa": "fa-arrows-alt", "title": "fullscreen"});

    let lis = "";
    for (let i = 0; i < btns.length; i++) {
        lis += '<span>';
        lis += '<i class="fa fa-lg ' + btns[i].fa + ' pe-2" aria-hidden="true" title="' + btns[i].title + '"' +
            (btns[i].fa === "fa-arrows-alt" ? 'id="fullscreen" ' : '') +
            '></i>';

        lis += '</span>';
    }

    const btnTarget = document.querySelector("#" + opts.btn_target);
    if (btnTarget) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = lis;
        while (tempDiv.firstChild) {
            btnTarget.appendChild(tempDiv.firstChild);
        }
    }

    addPbuttonEvents(opts);
}

function addPbuttonEvents(opts: Options) {
    // fullscreen
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    function handleFullscreenChange() {
        let local_dataset = current(opts);
        if (local_dataset !== undefined && local_dataset !== null) {
            opts.dataset = local_dataset;
        }
        rebuild(opts);
        setTimeout(function () {
            scale_to_fit(opts);
        }, 500);
    }

    const fullscreenBtn = document.querySelector('#fullscreen');
    if (fullscreenBtn) {
        fullscreenBtn.addEventListener('click', function (_e) {
            // toggle fullscreen
            if (!is_fullscreen()) {
                let target = document.querySelector("#" + opts.targetDiv);
                if (target && target.requestFullscreen) {
                    target.requestFullscreen();
                }
            } else {
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                }
            }
        });
    }

    function zoomIn() {
        btn_zoom(opts, 1.05);
    }

    function zoomOut() {
        btn_zoom(opts, 0.95);
    }

    document.querySelectorAll('.fa-plus-circle, .fa-minus-circle').forEach((elt) => {
        elt.addEventListener('mousedown', () => {
            const timeoutId = setInterval(
                elt.classList.contains("fa-plus-circle") ? zoomIn : zoomOut,
                50
            );

            const clearZoomInterval = function() {
                clearInterval(timeoutId);
            };

            elt.addEventListener('mouseup', clearZoomInterval);
            elt.addEventListener('mouseleave', clearZoomInterval);
        });
    });

    // undo/redo/reset
    const btnTarget = document.querySelector("#" + opts.btn_target);
    if (btnTarget) {
        btnTarget.addEventListener("click" as keyof ElementEventMap, (event: Event) => {
            event.stopPropagation();
            if (!event.target) {
                return;
            }

            const element = event.target as HTMLElement;
            if (element.classList.contains("disabled")) {
                return false;
            }

            if (element.classList.contains('fa-undo')) {
                opts.dataset = previous(opts);
                const targetDiv = document.querySelector("#" + opts.targetDiv);
                if (targetDiv) {
                    while (targetDiv.firstChild) {
                        targetDiv.removeChild(targetDiv.firstChild);
                    }
                }
                build(opts);
            } else if (element.classList.contains('fa-redo')) {
                opts.dataset = next(opts);
                const targetDiv = document.querySelector("#" + opts.targetDiv);
                if (targetDiv) {
                    while (targetDiv.firstChild) {
                        targetDiv.removeChild(targetDiv.firstChild);
                    }
                }
                build(opts);
            } else if (element.classList.contains('fa-refresh')) {
                messages("Pedigree Reset",
                    "This may result in loss of some data. Reset now?",
                    reset, opts);
            } else if (element.classList.contains('fa-crosshairs')) {
                scale_to_fit(opts);
            } else if (element.classList.contains('fa-file-image')) {
                return;
            }

            // trigger fhChange event
            document.dispatchEvent(new CustomEvent('fhChange', { detail: opts }));
        });
    }
}

// reset pedigree and clear the history
function reset(opts: Options) {
    let proband;
    if (opts.keep_proband_on_reset) {
        let local_dataset = current(opts);
        let newDataset = copy_dataset(local_dataset);
        const probandIndex = getProbandIndex(newDataset);
        if (probandIndex !== undefined) {
            proband = newDataset[probandIndex];
            proband.name = "ch1";
            proband.mother = "f21";
            proband.father = "m21";
            // clear pedigree data but keep proband data and risk factors
            clear_pedigree_data(opts);
        }
    }

    if (!proband) {
        proband = {
            "name": "ch1",
            "sex": "F",
            "mother": "f21",
            "father": "m21",
            "proband": true,
            "status": "0",
            "display_name": "me"
        } as PedigreeDatasetNode;
        clear(opts); // clear all storage data
    }

    delete opts.dataset;

    const selected = document.querySelector<HTMLInputElement>("input[name='default_fam']:checked");
    if (selected?.value === 'extended2') {    // secondary relatives
        opts.dataset = [
            buildPerson('wZA', 'paternal grandfather', 'M', undefined, undefined, true),
            buildPerson('MAk', 'paternal grandmother', 'F', undefined, undefined, true),
            buildPerson('zwB', 'maternal grandfather', 'M', undefined, undefined, true),
            buildPerson('dOH', 'maternal grandmother', 'F', undefined, undefined, true),
            buildPerson('MKg', 'paternal aunt', 'F', 'wZA', 'MAk'),
            buildPerson('xsm', 'paternal uncle', 'M', 'wZA', 'MAk'),

            buildPerson('m21', 'father', 'M', 'wZA', 'MAk'),
            buildPerson('f21', 'mother', 'F', 'zwB', 'dOH'),
            buildPerson('xsm', 'sister', 'F', 'm21', 'f21'),
            buildPerson('xsm', 'brother', 'M', 'm21', 'f21'),

            buildPerson('Spj', 'partner', 'M', 'm21', 'f21', false, true),

            proband,

            buildPerson('zhk', 'daughter', 'F', 'Spj', 'ch1'),
            buildPerson('Knx', 'son', 'M', 'Spj', 'ch1'),

            buildPerson('uuc', 'maternal aunt', 'F', 'zwB', 'dOH'),
            buildPerson('xIw', 'maternal uncle', 'M', 'zwB', 'dOH'),
        ];
    } else if (selected?.value === 'extended1') {    // primary relatives
        opts.dataset = [
            buildPerson('m21', 'father', 'M', undefined, undefined, false, true),
            buildPerson('f21', 'mother', 'F', undefined, undefined, false, true),

            buildPerson('aOH', 'sister', 'F', 'm21', 'f21'),
            buildPerson('Vha', 'brother', 'M', 'm21', 'f21'),

            buildPerson('Spj', 'partner', 'M', 'm21', 'f21', false, true),

            proband,
            buildPerson('zhk', 'daughter', 'F', 'Spj', 'ch1'),
            buildPerson('Knx', 'son', 'M', 'Spj', 'ch1'),
        ]
    } else {
        opts.dataset = [
            buildPerson('m21', 'father', 'M', undefined, undefined, true),
            buildPerson('f21', 'mother', 'F', undefined, undefined, true),

            proband
        ];
    }

    document.dispatchEvent(new CustomEvent('rebuild', { detail: opts }));
}

export function updateButtons(opts: Options, storeCount?: number) {
    let current = get_count(opts);
    let nstore = storeCount !== undefined ? storeCount : inStoreCount(opts);
    let id = "#" + opts.btn_target;

    const redoBtn = document.querySelector(`${id} .fa-redo`);
    if (redoBtn) {
        if (nstore <= current) {
            redoBtn.classList.add('disabled');
        } else {
            redoBtn.classList.remove('disabled');
        }
    }

    const undoBtn = document.querySelector(`${id} .fa-undo`);
    if (undoBtn) {
        if (current > 1) {
            undoBtn.classList.remove('disabled');
        } else {
            undoBtn.classList.add('disabled');
        }
    }
}
