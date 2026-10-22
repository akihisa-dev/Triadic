import type { DetailChange } from "../../core/domain/detailDocuments";
import type { HistoryComparison } from "../../core/domain/historyDifference";
import type { ExpansionCategoryChange } from "../../core/domain/expansionCategoryMaster";
import { type KindId, type PlanChange } from "../../core/domain/kinds";
import { type PeriodTypeChange } from "../../core/domain/periodMaster";
import { type DepartmentChange } from "../../core/domain/departmentMaster";
import { type IndustryChange } from "../../core/domain/industryMaster";
import { type ExpansionChange } from "../../core/domain/expansionMaster";
import { type Initiative, type InitiativeEntryDraft, type PlanContents } from "../../core/domain/plan";
import { type AccountChange } from "../../core/domain/accountMaster";
import { type AggregationChange } from "../../core/domain/aggregationMaster";

import type { DataHistoryStatus, HistoryDeletion } from "../../core/domain/dataHistory";
import type { WindowPlanSession } from "../WindowPlanSession";


export type Page = "spreadsheet-io" | "data-history" | "previous-input" | "home" | "initiative-entry" | "initiative-list" | "initiative-detail" | "cost-table" | "expansion-table" | "details" | "detail-editor" | "master" | "aggregation-master" | "account-master" | "expansion-master" | "expansion-category-master" | "industry-master" | "department-master" | "period-master" | "kind-master" | "account-type-master" | "amount-item-master";

export type Screen = {
  page: Page;
  detailKind?: KindId;
  selectedDetailId?: string;
  selectedInitiative: Pick<Initiative, "id" | "fiscalYear"> | null;
  detailOrigin: "home" | "initiative-list" | "expansion-table" | "cost-table" | "detail-editor";
};

export type HomePageProps = {
  windows?: WindowPlanSession | undefined;
  onChangeDetail: (change: DetailChange) => Promise<PlanContents>;
  onChangePlan: (change: PlanChange) => Promise<PlanContents>;
  fileName: string;
  initialContents: PlanContents;
  onChangeMaster: (change: AccountChange) => Promise<PlanContents>;
  onChangePeriodTypes: (change: PeriodTypeChange) => Promise<PlanContents>;
  onChangeDepartments: (change: DepartmentChange) => Promise<PlanContents>;
  onChangeIndustries: (change: IndustryChange) => Promise<PlanContents>;
  onChangeExpansionCategories: (change: ExpansionCategoryChange) => Promise<PlanContents>;
  onChangeExpansions: (change: ExpansionChange) => Promise<PlanContents>;
  onChangeAggregations: (change: AggregationChange) => Promise<PlanContents>;
  onRegisterInitiative: (draft: InitiativeEntryDraft) => Promise<PlanContents>;
  onUpdateInitiative: (id: number, year: number | null, draft: InitiativeEntryDraft) => Promise<PlanContents>;
  onPrepareSave: () => Promise<void>;
  onCloseFile: () => void;
  onSaveAs: () => Promise<PlanContents>;
  dataHistory: DataHistoryStatus;
  historyError: string;
  historyBusy: boolean;
  onCompareHistory: (id: number) => Promise<HistoryComparison>;
  onPreviewHistory: (id: number) => Promise<PlanContents>;
  onRestoreHistory: (id: number) => Promise<PlanContents>;
  onDeleteHistory: (deletion: HistoryDeletion) => Promise<void>;
  onRetryHistory: () => Promise<void>;
  canUndo: boolean;
  canRedo: boolean;
  operationRevision: number;
  onTravelOperation: (direction: -1 | 1) => Promise<PlanContents>;
};
