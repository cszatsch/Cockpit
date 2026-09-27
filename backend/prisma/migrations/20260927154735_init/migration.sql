-- CreateEnum
CREATE TYPE "ActiveStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('PREPARATION', 'ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'DONE');

-- CreateEnum
CREATE TYPE "WorkstreamStatus" AS ENUM ('ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "DatePrecision" AS ENUM ('D', 'M', 'Y');

-- CreateEnum
CREATE TYPE "TeamKind" AS ENUM ('CLIENT', 'AMOA', 'INTEGRATOR', 'OTHER');

-- CreateEnum
CREATE TYPE "Frequency" AS ENUM ('DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ON_DEMAND');

-- CreateEnum
CREATE TYPE "BodyLevel" AS ENUM ('STRATEGIC', 'STEERING', 'OPERATIONAL', 'OFF_CYCLE');

-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('CHAIR', 'MEMBER', 'SECRETARY', 'GUEST');

-- CreateEnum
CREATE TYPE "RiskStatus" AS ENUM ('OPEN', 'MITIGATING', 'CLOSED');

-- CreateEnum
CREATE TYPE "IssueStatus" AS ENUM ('OPEN', 'RESOLVING', 'RESOLVED');

-- CreateEnum
CREATE TYPE "ActionStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'BLOCKED', 'DONE');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('RISK', 'ISSUE', 'MILESTONE', 'DECISION');

-- CreateEnum
CREATE TYPE "DecisionStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'TO_ARBITRATE', 'ARBITRATED', 'CANCELLED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('PLANNED', 'HELD', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "DeliverableRisk" AS ENUM ('OK', 'TENSION', 'CRITICAL');

-- CreateEnum
CREATE TYPE "MissionStatus" AS ENUM ('INVOICED', 'IN_PROGRESS', 'NEGOTIATION');

-- CreateEnum
CREATE TYPE "Confidentiality" AS ENUM ('INTERNAL', 'RESTRICTED');

-- CreateEnum
CREATE TYPE "DocumentSource" AS ENUM ('UPLOADED', 'GENERATED');

-- CreateEnum
CREATE TYPE "ExtractionStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'PARTIAL', 'UNSUPPORTED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'DONE');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "Profile" AS ENUM ('ADMIN', 'PMO', 'RESPONSABLE', 'LECTEUR');

-- CreateEnum
CREATE TYPE "AuditOrigin" AS ENUM ('MANUAL', 'JEV', 'IMPORT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('INFO', 'SENSITIVE', 'CRITICAL');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ProviderStatus" AS ENUM ('OK', 'ERROR', 'UNTESTED');

-- CreateEnum
CREATE TYPE "UsageSource" AS ENUM ('COCKPIT', 'JEV', 'NOTIFICATION', 'IMPORT');

-- CreateEnum
CREATE TYPE "SnapshotKind" AS ENUM ('AUTO', 'MANUAL');

-- CreateEnum
CREATE TYPE "SnapshotStatus" AS ENUM ('RUNNING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "RuleKind" AS ENUM ('NOTIFICATION', 'ALERT');

-- CreateEnum
CREATE TYPE "RuleFrequency" AS ENUM ('IMMEDIATE', 'DAILY', 'WEEKLY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('APP', 'EMAIL');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('OK', 'ERROR');

-- CreateEnum
CREATE TYPE "ModuleScope" AS ENUM ('OFF', 'ALL', 'PROJECTS');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('CHECKED', 'REJECTED', 'IMPORTED');

-- CreateEnum
CREATE TYPE "ChangeStatus" AS ENUM ('PROPOSED', 'CONFIRMED', 'REJECTED');

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "ActiveStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "objective" TEXT,
    "startDate" TEXT NOT NULL,
    "targetEndDate" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Paris',
    "city" TEXT,
    "country" TEXT NOT NULL DEFAULT 'France',
    "status" "ProjectStatus" NOT NULL DEFAULT 'PREPARATION',
    "editorTeamId" TEXT,
    "integratorTeamId" TEXT,
    "programDirectorId" TEXT,
    "sponsorId" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "forecastGoliveIso" TEXT,
    "healthOverride" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectSection" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT,
    "value" JSONB NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BaselineVersion" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "approvedAt" TEXT,
    "approvedById" TEXT,
    "reason" TEXT,
    "current" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BaselineVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentBlock" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ContentBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wave" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TEXT,
    "startPrec" "DatePrecision" NOT NULL DEFAULT 'D',
    "endDate" TEXT,
    "endPrec" "DatePrecision" NOT NULL DEFAULT 'D',
    "status" "PlanStatus" NOT NULL DEFAULT 'PLANNED',
    "ownerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Wave_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Phase" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "startDate" TEXT NOT NULL,
    "startPrec" "DatePrecision" NOT NULL DEFAULT 'D',
    "endDate" TEXT NOT NULL,
    "endPrec" "DatePrecision" NOT NULL DEFAULT 'D',
    "status" "PlanStatus" NOT NULL DEFAULT 'PLANNED',
    "progressPct" INTEGER NOT NULL DEFAULT 0,
    "plannedPctOverride" INTEGER,
    "critical" BOOLEAN NOT NULL DEFAULT false,
    "ownerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Phase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhaseWave" (
    "phaseId" TEXT NOT NULL,
    "waveId" TEXT NOT NULL,
    "startDate" TEXT,
    "startPrec" "DatePrecision",
    "endDate" TEXT,
    "endPrec" "DatePrecision",

    CONSTRAINT "PhaseWave_pkey" PRIMARY KEY ("phaseId","waveId")
);

-- CreateTable
CREATE TABLE "Subphase" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "phaseId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "startDate" TEXT,
    "startPrec" "DatePrecision" NOT NULL DEFAULT 'D',
    "endDate" TEXT,
    "endPrec" "DatePrecision" NOT NULL DEFAULT 'D',
    "status" "PlanStatus" NOT NULL DEFAULT 'PLANNED',
    "progressPct" INTEGER NOT NULL DEFAULT 0,
    "plannedPctOverride" INTEGER,
    "critical" BOOLEAN NOT NULL DEFAULT false,
    "ownerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Subphase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workstream" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "status" "WorkstreamStatus" NOT NULL DEFAULT 'ACTIVE',
    "startDate" TEXT,
    "endDate" TEXT,
    "progressPct" INTEGER NOT NULL DEFAULT 0,
    "plannedPctOverride" INTEGER,
    "critical" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "dependsOnAll" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Workstream_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkstreamPhase" (
    "wsId" TEXT NOT NULL,
    "phaseId" TEXT NOT NULL,

    CONSTRAINT "WorkstreamPhase_pkey" PRIMARY KEY ("wsId","phaseId")
);

-- CreateTable
CREATE TABLE "WorkstreamWave" (
    "wsId" TEXT NOT NULL,
    "waveId" TEXT NOT NULL,

    CONSTRAINT "WorkstreamWave_pkey" PRIMARY KEY ("wsId","waveId")
);

-- CreateTable
CREATE TABLE "WorkstreamDependency" (
    "wsId" TEXT NOT NULL,
    "dependsOnId" TEXT NOT NULL,

    CONSTRAINT "WorkstreamDependency_pkey" PRIMARY KEY ("wsId","dependsOnId")
);

-- CreateTable
CREATE TABLE "WorkstreamProgress" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "wsId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "valuePct" INTEGER NOT NULL,
    "targetPct" INTEGER NOT NULL,
    "detail" TEXT,
    "ownerId" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "WorkstreamProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Milestone" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "n" TEXT NOT NULL,
    "phaseId" TEXT NOT NULL,
    "subphaseId" TEXT,
    "wsId" TEXT,
    "waveId" TEXT,
    "ownerId" TEXT,
    "iso" TEXT NOT NULL,
    "baselineIso" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Milestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deliverable" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subphaseId" TEXT NOT NULL,
    "workstreamId" TEXT,
    "ownerId" TEXT NOT NULL,
    "start" TEXT,
    "due" TEXT NOT NULL,
    "prog" INTEGER NOT NULL DEFAULT 0,
    "riskOverride" "DeliverableRisk",
    "teamLabel" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Deliverable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "kind" "TeamKind" NOT NULL DEFAULT 'OTHER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectRole" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "tier" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ProjectRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "teamId" TEXT,
    "title" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "photoUrl" TEXT,
    "wsIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovernanceBody" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "frequency" "Frequency" NOT NULL,
    "level" "BodyLevel",
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "GovernanceBody_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BodyMember" (
    "bodyId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "role" "MemberRole" NOT NULL DEFAULT 'MEMBER',
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BodyMember_pkey" PRIMARY KEY ("bodyId","personId")
);

-- CreateTable
CREATE TABLE "Risk" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "n" TEXT NOT NULL,
    "p" INTEGER NOT NULL,
    "i" INTEGER NOT NULL,
    "plan" TEXT,
    "ownerId" TEXT NOT NULL,
    "wsId" TEXT NOT NULL,
    "dueIso" TEXT,
    "status" "RiskStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Risk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Issue" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "n" TEXT NOT NULL,
    "sev" INTEGER NOT NULL,
    "originRiskId" TEXT,
    "openedIso" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "wsId" TEXT NOT NULL,
    "targetIso" TEXT,
    "targetSessionId" TEXT,
    "detail" TEXT NOT NULL DEFAULT '',
    "status" "IssueStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Issue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Action" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "n" TEXT NOT NULL,
    "detail" TEXT,
    "ownerId" TEXT NOT NULL,
    "wsId" TEXT NOT NULL,
    "dueIso" TEXT,
    "status" "ActionStatus" NOT NULL DEFAULT 'OPEN',
    "prio" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "sourceType" "SourceType",
    "sourceId" TEXT,
    "closedAt" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Action_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Decision" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "t" TEXT NOT NULL,
    "p" INTEGER NOT NULL,
    "status" "DecisionStatus" NOT NULL DEFAULT 'DRAFT',
    "crIso" TEXT NOT NULL,
    "ddIso" TEXT,
    "wsId" TEXT NOT NULL,
    "bodyId" TEXT NOT NULL,
    "decL" TEXT,
    "makerId" TEXT,
    "impact" TEXT,
    "supersedesId" TEXT,
    "expectedSessionId" TEXT,
    "full" BOOLEAN NOT NULL DEFAULT false,
    "opt" TEXT,
    "arbitration" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "bodyId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "dateIso" TEXT NOT NULL,
    "time" TEXT,
    "place" TEXT,
    "status" "SessionStatus" NOT NULL DEFAULT 'PLANNED',
    "participants" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reportId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportTemplate" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bodyId" TEXT,
    "authorId" TEXT,
    "authorLabel" TEXT,
    "version" TEXT NOT NULL DEFAULT 'v1',
    "description" TEXT NOT NULL DEFAULT '',
    "components" JSONB NOT NULL,
    "pages" INTEGER NOT NULL DEFAULT 1,
    "publishedAt" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "rowVersion" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ReportTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportInstance" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "templateId" TEXT,
    "sessionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "v" TEXT NOT NULL DEFAULT 'v1',
    "status" "ReportStatus" NOT NULL DEFAULT 'DRAFT',
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reportingDate" TEXT,
    "captureAt" TIMESTAMP(3),
    "reviewerId" TEXT,
    "validatorId" TEXT,
    "audience" TEXT,
    "fileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ReportInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BarometerSurvey" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "overallScore" DOUBLE PRECISION,
    "respondents" INTEGER,
    "sentiment" JSONB,
    "questions" JSONB,
    "themes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "BarometerSurvey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BarometerDomain" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "n" TEXT NOT NULL,
    "size" INTEGER NOT NULL DEFAULT 0,
    "resp" INTEGER NOT NULL DEFAULT 0,
    "series" JSONB NOT NULL,
    "range" TEXT NOT NULL DEFAULT '',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "BarometerDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MissionPeriod" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "amoa" DOUBLE PRECISION NOT NULL,
    "sub" DOUBLE PRECISION NOT NULL,
    "status" "MissionStatus" NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "MissionPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramBudget" (
    "projectId" TEXT NOT NULL,
    "known" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ProgramBudget_pkey" PRIMARY KEY ("projectId")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "n" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "dateIso" TEXT NOT NULL,
    "v" TEXT NOT NULL DEFAULT 'v1',
    "conf" "Confidentiality" NOT NULL DEFAULT 'INTERNAL',
    "src" "DocumentSource" NOT NULL DEFAULT 'UPLOADED',
    "ext" "ExtractionStatus" NOT NULL DEFAULT 'PENDING',
    "mime" TEXT NOT NULL,
    "pages" INTEGER,
    "fileKey" TEXT,
    "sizeBytes" INTEGER,
    "linkedLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentLink" (
    "documentId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,

    CONSTRAINT "DocumentLink_pkey" PRIMARY KEY ("documentId","entityType","entityId")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "dueIso" TEXT,
    "detail" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "link" JSONB,
    "cta" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskOverride" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "title" TEXT,
    "detail" TEXT,
    "dueIso" TEXT,
    "cta" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CellComment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CellComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPreferences" (
    "accountId" TEXT NOT NULL,
    "dashboardLayout" JSONB,
    "theme" JSONB,
    "firstName" TEXT,
    "city" TEXT,
    "photoUrl" TEXT,
    "notifications" JSONB,
    "language" TEXT,
    "timezone" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPreferences_pkey" PRIMARY KEY ("accountId")
);

-- CreateTable
CREATE TABLE "AssistantChange" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "op" TEXT NOT NULL,
    "patch" JSONB NOT NULL,
    "summary" TEXT NOT NULL,
    "status" "ChangeStatus" NOT NULL DEFAULT 'PROPOSED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "AssistantChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssistantFile" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'READY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "personId" TEXT,
    "status" "AccountStatus" NOT NULL DEFAULT 'INVITED',
    "invitedAt" TIMESTAMP(3),
    "inviteExpiresAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "photoUrl" TEXT,
    "profile" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountProject" (
    "accountId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,

    CONSTRAINT "AccountProject_pkey" PRIMARY KEY ("accountId","projectId")
);

-- CreateTable
CREATE TABLE "Habilitation" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "personId" TEXT,
    "accountId" TEXT,
    "profile" "Profile" NOT NULL,
    "wsId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Habilitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminGrant" (
    "accountId" TEXT NOT NULL,
    "since" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grantedById" TEXT,

    CONSTRAINT "AdminGrant_pkey" PRIMARY KEY ("accountId")
);

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "device" TEXT,
    "location" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvitationRequest" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,

    CONSTRAINT "InvitationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEntry" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accountId" TEXT,
    "actorName" TEXT NOT NULL,
    "personId" TEXT,
    "profileUsed" TEXT,
    "origin" "AuditOrigin" NOT NULL DEFAULT 'MANUAL',
    "severity" "Severity" NOT NULL DEFAULT 'INFO',
    "action" TEXT NOT NULL,
    "target" TEXT,
    "projectId" TEXT,
    "wsId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "field" TEXT,
    "oldValue" JSONB,
    "newValue" JSONB,

    CONSTRAINT "AuditEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Provider" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyPrefix" TEXT,
    "keyLast4" TEXT,
    "keyCipher" TEXT,
    "status" "ProviderStatus" NOT NULL DEFAULT 'UNTESTED',
    "latencyMs" INTEGER,
    "lastTestedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Provider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiModel" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "priceInPerMTok" DOUBLE PRECISION NOT NULL,
    "priceOutPerMTok" DOUBLE PRECISION NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "AiModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelAssignment" (
    "functionId" TEXT NOT NULL,
    "primaryModelId" TEXT NOT NULL,
    "fallbackModelId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ModelAssignment_pkey" PRIMARY KEY ("functionId")
);

-- CreateTable
CREATE TABLE "UsageRecord" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT,
    "functionId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "tokensIn" INTEGER NOT NULL,
    "tokensOut" INTEGER NOT NULL,
    "costEur" DOUBLE PRECISION NOT NULL,
    "fallbackUsed" BOOLEAN NOT NULL DEFAULT false,
    "source" "UsageSource" NOT NULL,

    CONSTRAINT "UsageRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetThreshold" (
    "id" TEXT NOT NULL,
    "limitEur" DOUBLE PRECISION,
    "warnPct" INTEGER NOT NULL DEFAULT 80,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "BudgetThreshold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetAlertFired" (
    "thresholdId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "firedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BudgetAlertFired_pkey" PRIMARY KEY ("thresholdId","month")
);

-- CreateTable
CREATE TABLE "Snapshot" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" "SnapshotKind" NOT NULL,
    "label" TEXT,
    "takenById" TEXT,
    "takenBy" TEXT,
    "status" "SnapshotStatus" NOT NULL DEFAULT 'DONE',
    "storageKey" TEXT,
    "stats" JSONB,

    CONSTRAINT "Snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SnapshotSchedule" (
    "projectId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "frequency" TEXT NOT NULL DEFAULT 'Hebdomadaire',
    "day" TEXT NOT NULL DEFAULT 'Vendredi',
    "hour" TEXT NOT NULL DEFAULT '04:00',
    "retention" TEXT NOT NULL DEFAULT '12 mois',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SnapshotSchedule_pkey" PRIMARY KEY ("projectId")
);

-- CreateTable
CREATE TABLE "NotificationRule" (
    "id" TEXT NOT NULL,
    "kind" "RuleKind" NOT NULL,
    "name" TEXT NOT NULL,
    "targetProfiles" TEXT[],
    "projectIds" TEXT[],
    "platform" BOOLEAN NOT NULL DEFAULT false,
    "modelId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "frequency" "RuleFrequency" NOT NULL,
    "day" TEXT,
    "hour" TEXT,
    "everyDays" INTEGER,
    "channels" "Channel"[],
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "NotificationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Delivery" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "channel" "Channel" NOT NULL,
    "recipientsCount" INTEGER NOT NULL,
    "status" "DeliveryStatus" NOT NULL,
    "error" TEXT,
    "costEur" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tokens" INTEGER NOT NULL DEFAULT 0,
    "projectId" TEXT,
    "subject" TEXT,
    "body" TEXT,

    CONSTRAINT "Delivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Module" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "scope" "ModuleScope" NOT NULL DEFAULT 'OFF',
    "globalSince" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Module_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModuleProject" (
    "moduleId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "since" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModuleProject_pkey" PRIMARY KEY ("moduleId","projectId")
);

-- CreateTable
CREATE TABLE "ModuleRequest" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "requestedById" TEXT,
    "requestedBy" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "ModuleRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectImport" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ImportStatus" NOT NULL,
    "report" JSONB NOT NULL,
    "parsed" JSONB,
    "projectId" TEXT,

    CONSTRAINT "ProjectImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Client_code_key" ON "Client"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Project_code_key" ON "Project"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectSection_projectId_key_key" ON "ProjectSection"("projectId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "BaselineVersion_projectId_version_key" ON "BaselineVersion"("projectId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ContentBlock_projectId_key_key" ON "ContentBlock"("projectId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Wave_projectId_seq_key" ON "Wave"("projectId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "Phase_projectId_seq_key" ON "Phase"("projectId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "Subphase_projectId_code_key" ON "Subphase"("projectId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Workstream_projectId_code_key" ON "Workstream"("projectId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Milestone_projectId_code_key" ON "Milestone"("projectId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Team_projectId_name_key" ON "Team"("projectId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectRole_projectId_label_key" ON "ProjectRole"("projectId", "label");

-- CreateIndex
CREATE UNIQUE INDEX "Person_projectId_email_key" ON "Person"("projectId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "Assignment_personId_roleId_startDate_key" ON "Assignment"("personId", "roleId", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "GovernanceBody_projectId_shortName_key" ON "GovernanceBody"("projectId", "shortName");

-- CreateIndex
CREATE UNIQUE INDEX "Risk_projectId_code_key" ON "Risk"("projectId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Issue_projectId_code_key" ON "Issue"("projectId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Action_projectId_code_key" ON "Action"("projectId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Decision_projectId_code_key" ON "Decision"("projectId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Session_bodyId_number_key" ON "Session"("bodyId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "BarometerSurvey_projectId_month_key" ON "BarometerSurvey"("projectId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "TaskOverride_personId_entityType_entityId_key" ON "TaskOverride"("personId", "entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_email_key" ON "Account"("email");

-- CreateIndex
CREATE INDEX "AuditEntry_projectId_entityType_entityId_idx" ON "AuditEntry"("projectId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditEntry_at_idx" ON "AuditEntry"("at");

-- CreateIndex
CREATE INDEX "UsageRecord_at_idx" ON "UsageRecord"("at");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectSection" ADD CONSTRAINT "ProjectSection_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BaselineVersion" ADD CONSTRAINT "BaselineVersion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentBlock" ADD CONSTRAINT "ContentBlock_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wave" ADD CONSTRAINT "Wave_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Phase" ADD CONSTRAINT "Phase_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhaseWave" ADD CONSTRAINT "PhaseWave_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "Phase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhaseWave" ADD CONSTRAINT "PhaseWave_waveId_fkey" FOREIGN KEY ("waveId") REFERENCES "Wave"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subphase" ADD CONSTRAINT "Subphase_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subphase" ADD CONSTRAINT "Subphase_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "Phase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workstream" ADD CONSTRAINT "Workstream_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkstreamPhase" ADD CONSTRAINT "WorkstreamPhase_wsId_fkey" FOREIGN KEY ("wsId") REFERENCES "Workstream"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkstreamPhase" ADD CONSTRAINT "WorkstreamPhase_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "Phase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkstreamWave" ADD CONSTRAINT "WorkstreamWave_wsId_fkey" FOREIGN KEY ("wsId") REFERENCES "Workstream"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkstreamWave" ADD CONSTRAINT "WorkstreamWave_waveId_fkey" FOREIGN KEY ("waveId") REFERENCES "Wave"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkstreamDependency" ADD CONSTRAINT "WorkstreamDependency_wsId_fkey" FOREIGN KEY ("wsId") REFERENCES "Workstream"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkstreamDependency" ADD CONSTRAINT "WorkstreamDependency_dependsOnId_fkey" FOREIGN KEY ("dependsOnId") REFERENCES "Workstream"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "Phase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_subphaseId_fkey" FOREIGN KEY ("subphaseId") REFERENCES "Subphase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deliverable" ADD CONSTRAINT "Deliverable_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deliverable" ADD CONSTRAINT "Deliverable_subphaseId_fkey" FOREIGN KEY ("subphaseId") REFERENCES "Subphase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectRole" ADD CONSTRAINT "ProjectRole_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovernanceBody" ADD CONSTRAINT "GovernanceBody_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BodyMember" ADD CONSTRAINT "BodyMember_bodyId_fkey" FOREIGN KEY ("bodyId") REFERENCES "GovernanceBody"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentLink" ADD CONSTRAINT "DocumentLink_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountProject" ADD CONSTRAINT "AccountProject_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Habilitation" ADD CONSTRAINT "Habilitation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModuleProject" ADD CONSTRAINT "ModuleProject_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE CASCADE ON UPDATE CASCADE;
