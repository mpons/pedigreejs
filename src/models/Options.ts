import {PedigreeDatasetNode} from "@/models/PedigreeDatasetNode.ts";
import {DiseaseSetting} from "@/models/DiseaseSetting.ts";
import {HierarchyNode} from "d3";
import {DisplayType} from "@/models/Types/displayType.ts";

export interface Options {
    targetDiv: string
    btn_target: string
    width: number
    dataset?: PedigreeDatasetNode[]
    height: number
    symbol_size: number
    font_size: string
    font_family: string
    font_weight: number
    background: string
    node_background: string
    displayType: DisplayType
    store_type: 'array' | 'local' | 'storage' | 'session'
    //edit: boolean
    dragNode?: boolean
    showWidgets?: boolean
    zoomIn: number
    zoomOut: number
    zoomSrc: string[]
    labels: (string[] | string)[]
    keep_proband_on_reset: boolean
    diseases: DiseaseSetting[]
    DEBUG: boolean
    onDone?: (dataset: PedigreeDatasetNode[]) => void
    onChange?: (dataset: PedigreeDatasetNode[]) => void
    onEdit?: (personId: string) => void
    edit?: (opts: Options, d: HierarchyNode<PedigreeDatasetNode>) => void
    nodeClick?: (node: PedigreeDatasetNode) => void
    validate?: ((opts: Options) => boolean) | boolean
}