import {HierarchyNode} from "d3";
import {PedigreeDatasetNode} from "@/models/PedigreeDatasetNode.ts";

export type D3PartnerLink =  {female: HierarchyNode<PedigreeDatasetNode> | undefined, male: HierarchyNode<PedigreeDatasetNode> | undefined}
export type PedigreePartnerLink =  {female: PedigreeDatasetNode | undefined, male: PedigreeDatasetNode | undefined}