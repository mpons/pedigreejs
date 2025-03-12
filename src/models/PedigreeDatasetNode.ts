import {PedigreeGeneTestsResults} from "@/models/PedigreeGeneTestsResults.ts";
import {Sex} from "@/models/Types/Sex.ts";

export interface PedigreeDatasetNode {
    children?: PedigreeDatasetNode[]
    famid: string
    id?: number
    name: string
    parent_node?: PedigreeDatasetNode[]
    sex: Sex
    top_level?: boolean
    hidden?: boolean
    exclude?: boolean
    display_name: string
    proband: boolean
    displayProbandDistance?: number // Adjusted to have partners at the same distance from the proband so they are next to each other
    realProbandDistance?: number // Represents real distances and some partners can have a different distance from the proband (i.e. re-married parents)
    parent: PedigreeDatasetNode|null
    noparents?: boolean
    father?: PedigreeDatasetNode|string // String in the ped file, object internally
    mother?: PedigreeDatasetNode|string // String in the ped file, object internally
    divorced?: string
    mztwin?: string
    dztwin?: string
    adopted_in?: boolean
    adopted_out?: boolean
    status: '1' | '0' // isDead
    deathYear?: number
    miscarriage?: boolean
    termination?: boolean
    age?: number
    yob?: number
    height?: number
    weight?: number
    menarche?: number
    affected?: boolean
    cancer?: number
    ncancers?: number
    breast_cancer_diagnosis_age?: number
    breast_cancer2_diagnosis_age?: number
    ovarian_cancer_diagnosis_age?: number
    prostate_cancer_diagnosis_age?: number
    pancreatic_cancer_diagnosis_age?: number
    other_cancer_diagnosis_age?: number
    ashkenazi: boolean
    brca1_gene_test?: PedigreeGeneTestsResults
    brca2_gene_test?: PedigreeGeneTestsResults
    palb2_gene_test?: PedigreeGeneTestsResults
    atm_gene_test?: PedigreeGeneTestsResults
    chek2_gene_test?: PedigreeGeneTestsResults
    bard1_gene_test?: PedigreeGeneTestsResults
    rad51d_gene_test?: PedigreeGeneTestsResults
    rad51c_gene_test?: PedigreeGeneTestsResults
    brip1_gene_test?: PedigreeGeneTestsResults
    er_bc_pathology?: string
    pr_bc_pathology?: string
    her2_bc_pathology?: string
    ck14_bc_pathology?: string
    ck56_bc_pathology?: string
    notes?: string
    labels?: string[]
    alleles?: string
    other_cancer_name?: string
}