export * from "./generated/api";
// Note: types in "./generated/types" that share a name with a zod schema const
// exported above (e.g. request/response bodies referenced inline in openapi.yaml)
// are intentionally excluded here to avoid ambiguous re-export errors. The zod
// const already provides an equivalent inferred type for those names.
export type {
  AiSettings,
  AnalyzePhotoResponse,
  AuthUser,
  AuthUserRole,
  BulkNotificationBody,
  BulkNotificationResponse,
  DatesResponse,
  ErrorResponse,
  GeofenceResponse,
  GetVisitsReportParams,
  HealthStatus,
  ListVisitsParams,
  Profile,
  ReportResponse,
  ReportSummary,
  ReportTrendPoint,
  SuccessResponse,
  Template,
  TemplatesResponse,
  UploadResponse,
  Visit,
  VisitActionResponse,
  VisitPhoto,
  VisitPhotosResponse,
  VisitsResponse,
  VisitStatus,
} from "./generated/types";
