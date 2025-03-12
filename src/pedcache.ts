/**
/* © 2023 University of Cambridge
/* SPDX-FileCopyrightText: 2023 University of Cambridge
/* SPDX-License-Identifier: GPL-3.0-or-later
**/
import {Options} from "@/models/Options.ts";

//store a history of pedigree

let max_limit = 25;
let dict_cache: Record<string, number> = {};
let arrayCache: Record<string, string[]> = {};

// test if browser storage is supported
function has_browser_storage(opts: Options) {
	try {
		if(opts.store_type === 'array')
			return false;

		if(opts.store_type !== 'local' && opts.store_type !== 'session' && opts.store_type !== undefined)
			return false;

		let mod = 'test';
		localStorage.setItem(mod, mod);
		localStorage.removeItem(mod);
		return true;
	} catch(e) {
		return false;
	}
}

function getPedigreeCachePrefix(opts: Options): string {
	return "PEDIGREE_"+opts.btn_target+"_";
}

// use array cache
function getArrayCache(opts: Options) {
	return arrayCache[getPedigreeCachePrefix(opts)];
}

function get_browser_store(opts: Options, item: string): string|null {
	if(opts.store_type === 'local')
		return localStorage.getItem(item);
	else
		return sessionStorage.getItem(item);
}

function set_browser_store(opts: Options, name: string, item: string) {
	if(opts.store_type === 'local')
		return localStorage.setItem(name, item);
	else
		return sessionStorage.setItem(name, item);
}

// clear all storage items
function clear_browser_store(opts: Options) {
	if(opts.store_type === 'local')
		return localStorage.clear();
	else
		return sessionStorage.clear();
}

// remove all storage items with keys that have the pedigree history prefix
export function clear_pedigree_data(opts: Options) {
	let prefix = getPedigreeCachePrefix(opts);
	let store = (opts.store_type === 'local' ? localStorage : sessionStorage);
	let items: (string|null)[] = [];

	for(let i = 0; i < store.length; i++){
		if(store.key(i)?.indexOf(prefix) === 0)
			items.push(store.key(i));
	}

	for(let i = 0; i < items.length; i++) {
		if (items[i] !== null) {
			store.removeItem(items[i]!);
		}
	}
}

export function get_count(opts: Options): number {
	let count;
	if (has_browser_storage(opts)) {
		count = get_browser_store(opts, getPedigreeCachePrefix(opts) + 'COUNT')
	} else {
		count = dict_cache[getPedigreeCachePrefix(opts) + 'COUNT']
	}

	if(count !== null && count !== undefined) {
		if (typeof count === 'string') {
			return parseInt(count)
		}

		return count
	}

	return 0
}

function set_count(opts: Options, count: number) {
	if (has_browser_storage(opts))
		set_browser_store(opts, getPedigreeCachePrefix(opts)+'COUNT', ''+count);
	else
		dict_cache[getPedigreeCachePrefix(opts)+'COUNT'] = count;
}

export function init_cache(opts: Options) {
	if(!opts.dataset)
		return;
	let count = get_count(opts);

	if (has_browser_storage(opts)) {   // local storage
		set_browser_store(opts, getPedigreeCachePrefix(opts) + count, JSON.stringify(opts.dataset));
	} else {   // TODO :: array cache
		console.warn('Local storage not found/supported for this browser!', opts.store_type);
		max_limit = 500;
		if(getArrayCache(opts) === undefined) {
			arrayCache[getPedigreeCachePrefix(opts)] = [];
		}
		getArrayCache(opts).push(JSON.stringify(opts.dataset));
	}
	if(count < max_limit)
		count++;
	else
		count = 0;
	set_count(opts, count);
}

export function inStoreCount(opts: Options) {
	if(has_browser_storage(opts)) {
		for(let i = max_limit; i > 0; i--) {
			if(get_browser_store(opts, getPedigreeCachePrefix(opts)+(i-1)) !== null)
				return i;
		}
	} else {
		return (getArrayCache(opts) && getArrayCache(opts).length > 0 ? getArrayCache(opts).length : -1);
	}

	return -1;
}

export function current(opts: Options) {
	let current = get_count(opts)-1;

	if(current === -1) {
		current = max_limit
	}

	if(has_browser_storage(opts)) {
		return JSON.parse(get_browser_store(opts, getPedigreeCachePrefix(opts) + current) || '')
	} else if(getArrayCache(opts)) {
		return JSON.parse(getArrayCache(opts)[current]);
	}
}

export function last(opts: Options) {
	if(has_browser_storage(opts)) {
		for(let i=max_limit; i>0; i--) {
			let it = get_browser_store(opts, getPedigreeCachePrefix(opts)+(i-1));
			if(it !== null) {
				set_count(opts, i);
				return JSON.parse(it);
			}
		}
	} else {
		let cache = getArrayCache(opts);
		if(cache) {
			return JSON.parse(cache[cache.length - 1]);
		}
	}
	return undefined;
}

export function previous(opts: Options, previous?: number) {
	if(previous === undefined)
		previous = get_count(opts) - 2;

	if(previous < 0) {
		let nst = inStoreCount(opts);
		if(nst < max_limit)
			previous = nst - 1;
		else
			previous = max_limit - 1;
	}
	set_count(opts, previous + 1);
	if(has_browser_storage(opts))
		return JSON.parse(get_browser_store(opts, getPedigreeCachePrefix(opts) + previous) || '');
	else
		return JSON.parse(getArrayCache(opts)[previous]);
}

export function next(opts: Options, next?: number) {
	if(next === undefined)
		next = get_count(opts);
	if(next >= max_limit)
		next = 0;

	set_count(opts, next + 1);
	if(has_browser_storage(opts))
		return JSON.parse(get_browser_store(opts, getPedigreeCachePrefix(opts)+next) || '');
	else
		return JSON.parse(getArrayCache(opts)[next]);
}

export function clear(opts: Options) {
	if(has_browser_storage(opts))
		clear_browser_store(opts);
	dict_cache = {};
}

// zoom - store translation coords
export function setposition(opts: Options, x: number, y: number, zoom: number) {
	if(has_browser_storage(opts)) {
		let store = (opts.store_type === 'local' ? localStorage : sessionStorage);
		if(x) {
			set_browser_store(opts, getPedigreeCachePrefix(opts)+'_X', ''+x);
			set_browser_store(opts, getPedigreeCachePrefix(opts)+'_Y', ''+y);
		} else {
			store.removeItem(getPedigreeCachePrefix(opts)+'_X');
			store.removeItem(getPedigreeCachePrefix(opts)+'_Y');
		}

		let zoomName = getPedigreeCachePrefix(opts)+'_ZOOM';
		if(zoom)
			set_browser_store(opts, zoomName, ''+zoom);
		else
			store.removeItem(zoomName);
	} else {
		//TODO
	}
}

export function getPosition(opts: Options) {
	if (!has_browser_storage(opts)) {
		return [null, null]
	}

	const storageX = get_browser_store(opts, getPedigreeCachePrefix(opts)+'_X')
	const storageY = get_browser_store(opts, getPedigreeCachePrefix(opts)+'_X')

	if(storageX === null && storageY === null) {
		return [null, null]
	}

	let pos = [ parseInt(storageX || '0'), parseInt(storageY || '0') ];

	const zoom = get_browser_store(opts, getPedigreeCachePrefix(opts)+'_ZOOM')
	if(zoom !== null) {
		pos.push(parseFloat(zoom))
	}

	return pos;
}
