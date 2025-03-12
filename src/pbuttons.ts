/**
 /* © 2023 University of Cambridge
 /* SPDX-FileCopyrightText: 2023 University of Cambridge
 /* SPDX-License-Identifier: GPL-3.0-or-later
 **/

// @ts-nocheck
// undo, redo, reset buttons
import * as pedcache from './pedcache.js';
import {btn_zoom, scale_to_fit} from './zoom.ts';
import {copy_dataset, getProbandIndex, is_fullscreen, messages} from './utils.js';
import {Options} from "@/models/Options.ts";
import {build, rebuild} from './pedigree.js';

export function addButtons(options: Options) {
    let opts = {
        ...{
            btn_target: 'pedigree_history'
        }, ...options
    }

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
    document.querySelector("#" + opts.btn_target)?.append(lis);
    addPbuttonEvents(opts);
}

function addPbuttonEvents(opts: Options) {
    // fullscreen
    document.addEventListener('webkitfullscreenchange mozfullscreenchange fullscreenchange MSFullscreenChange', () => {
        let local_dataset = pedcache.current(opts);
        if (local_dataset !== undefined && local_dataset !== null) {
            opts.dataset = local_dataset;
        }
        rebuild(opts);
        setTimeout(function () {
            scale_to_fit(opts);
        }, 500);
    });

    document.querySelector('#fullscreen')?.addEventListener('click', function (_e) {
        // toggle fullscreen
        if (!is_fullscreen()) {
            let target = document.querySelector("#" + opts.targetDiv);
            if (target?.requestFullscreen) {
                target.requestFullscreen();
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
    });

    function zoomIn() {
        btn_zoom(opts, 1.05);
    }

    function zoomOut() {
        btn_zoom(opts, 0.95);
    }

    document.querySelectorAll('.fa-plus-circle, .fa-minus-circle').forEach((elt) => {
        elt.addEventListener('mousedown', () => {
            const timeoutId = setInterval((elt.classList.contains("fa-plus-circle") ? zoomIn : zoomOut), 50);
            elt.addEventListener('mouseup mouseleave', function () {
                clearInterval(timeoutId);
            });
        })

    })

    // undo/redo/reset
    document.querySelector("#" + opts.btn_target)?.addEventListener("click", (_: Element, e: MouseEvent) => {
        e.stopPropagation();
        if (!e.target) {
            return
        }
        const element = (e.target as HTMLElement)
        if (element.classList.contains("disabled"))
            return false;

        if (element.classList.contains('fa-undo')) {
            opts.dataset = pedcache.previous(opts);
            const targetDiv = document.querySelector("#" + opts.targetDiv)
            while (targetDiv?.firstChild) {
                element.removeChild(targetDiv.firstChild);
            }
            build(opts);
        } else if (element.classList.contains('fa-redo')) {
            opts.dataset = pedcache.next(opts);
            const targetDiv = document.querySelector("#" + opts.targetDiv)
            while (targetDiv?.firstChild) {
                element.removeChild(targetDiv.firstChild);
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
        $(document).trigger('fhChange', [opts]);
    });
}

// reset pedigree and clear the history
function reset(opts: Options) {
    let proband;
    if (opts.keep_proband_on_reset) {
        let local_dataset = pedcache.current(opts);
        let newDataset = copy_dataset(local_dataset);
        const probandIndex = getProbandIndex(newDataset)
        if (probandIndex) {
            proband = newDataset[probandIndex];
            //let children = pedigree_util.getChildren(newDataset, proband);
            proband.name = "ch1";
            proband.mother = "f21";
            proband.father = "m21";
            // clear pedigree data but keep proband data and risk factors
            pedcache.clear_pedigree_data(opts)
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
        };
        pedcache.clear(opts); // clear all storage data
    }

    delete opts.dataset;

    let selected = document.querySelector<HTMLInputElement>("input[name='default_fam']:checked");
    if (selected?.value === 'extended2') {    // secondary relatives
        opts.dataset = [
            {"name": "wZA", "sex": "M", "top_level": true, "status": "0", "display_name": "paternal grandfather"},
            {"name": "MAk", "sex": "F", "top_level": true, "status": "0", "display_name": "paternal grandmother"},
            {"name": "zwB", "sex": "M", "top_level": true, "status": "0", "display_name": "maternal grandfather"},
            {"name": "dOH", "sex": "F", "top_level": true, "status": "0", "display_name": "maternal grandmother"},
            {
                "name": "MKg",
                "sex": "F",
                "mother": "MAk",
                "father": "wZA",
                "status": "0",
                "display_name": "paternal aunt"
            },
            {
                "name": "xsm",
                "sex": "M",
                "mother": "MAk",
                "father": "wZA",
                "status": "0",
                "display_name": "paternal uncle"
            },
            {"name": "m21", "sex": "M", "mother": "MAk", "father": "wZA", "status": "0", "display_name": "father"},
            {"name": "f21", "sex": "F", "mother": "dOH", "father": "zwB", "status": "0", "display_name": "mother"},
            {"name": "aOH", "sex": "F", "mother": "f21", "father": "m21", "status": "0", "display_name": "sister"},
            {"name": "Vha", "sex": "M", "mother": "f21", "father": "m21", "status": "0", "display_name": "brother"},
            {
                "name": "Spj",
                "sex": "M",
                "mother": "f21",
                "father": "m21",
                "noparents": true,
                "status": "0",
                "display_name": "partner"
            },
            proband,
            {"name": "zhk", "sex": "F", "mother": "ch1", "father": "Spj", "status": "0", "display_name": "daughter"},
            {"name": "Knx", "display_name": "son", "sex": "M", "mother": "ch1", "father": "Spj", "status": "0"},
            {
                "name": "uuc",
                "display_name": "maternal aunt",
                "sex": "F",
                "mother": "dOH",
                "father": "zwB",
                "status": "0"
            },
            {
                "name": "xIw",
                "display_name": "maternal uncle",
                "sex": "M",
                "mother": "dOH",
                "father": "zwB",
                "status": "0"
            }];
    } else if (selected?.value === 'extended1') {    // primary relatives
        opts.dataset = [
            {
                "name": "m21",
                "sex": "M",
                "mother": null,
                "father": null,
                "status": "0",
                "display_name": "father",
                "noparents": true
            },
            {
                "name": "f21",
                "sex": "F",
                "mother": null,
                "father": null,
                "status": "0",
                "display_name": "mother",
                "noparents": true
            },
            {"name": "aOH", "sex": "F", "mother": "f21", "father": "m21", "status": "0", "display_name": "sister"},
            {"name": "Vha", "sex": "M", "mother": "f21", "father": "m21", "status": "0", "display_name": "brother"},
            {
                "name": "Spj",
                "sex": "M",
                "mother": "f21",
                "father": "m21",
                "noparents": true,
                "status": "0",
                "display_name": "partner"
            },
            proband,
            {"name": "zhk", "sex": "F", "mother": "ch1", "father": "Spj", "status": "0", "display_name": "daughter"},
            {"name": "Knx", "display_name": "son", "sex": "M", "mother": "ch1", "father": "Spj", "status": "0"}];
    } else {
        opts.dataset = [
            {"name": "m21", "display_name": "father", "sex": "M", "top_level": true},
            {"name": "f21", "display_name": "mother", "sex": "F", "top_level": true},
            proband];
    }

    document.dispatchEvent({type: 'rebuild', detail: opts} as CustomEvent<Options>);
}

export function updateButtons(opts: Options, inStoreCount?: number) {
    let current = pedcache.get_count(opts);
    let nstore = inStoreCount !== undefined ? inStoreCount : pedcache.inStoreCount(opts);
    let id = "#" + opts.btn_target;

    if (nstore <= current) {
        document.querySelector(id + " .fa-redo")?.classList.add('disabled');
    } else {
        document.querySelector(id + " .fa-redo")?.classList.remove('disabled')
    }

    if (current > 1) {
        document.querySelector(id + " .fa-undo")?.classList.remove('disabled')
    } else {
        document.querySelector(id + " .fa-undo")?.classList.add('disabled');
    }
}
