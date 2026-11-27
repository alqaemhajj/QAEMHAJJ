import { Pilgrim, NotificationItem } from '../types';
import { safeStorage } from '../utils/safeStorage';
import {
  AlQaemExcelSummaryItem,
  exportAlQaemExcelReport,
  inferReportMetadataFromFilename,
} from '../utils/alqaemExcelEngine';
import {
  AwarenessProgram,
  AssessmentQuestion,
  FiqhMasteryStatus,
  FiqhSection,
  LessonAttendanceRecord,
  PilgrimEducationStatus,
  PilgrimEducationalProgress,
  PilgrimGuideFollowUp,
  PilgrimTawafStatus,
  ReligiousAssessment,
  ReligiousGuide,
  ReligiousLesson,
  ReligiousReferenceMaterial,
  ShariaInquiry,
} from '../types/religiousGuidance';
import {
  INITIAL_ASSESSMENT_QUESTIONS,
  INITIAL_ASSESSMENTS,
  INITIAL_AWARENESS_PROGRAMS,
  INITIAL_FIQH_SECTIONS,
  INITIAL_REFERENCE_MATERIALS,
  INITIAL_RELIGIOUS_GUIDES,
  INITIAL_RELIGIOUS_LESSONS,
  INITIAL_SHARIA_INQUIRIES,
} from '../data/religiousGuidanceData';
import { setDocument, removeDocument, subscribeToCollection, recordActivityLog } from './db';
import { createAndDispatchNotification } from './notifications';

const STORAGE_KEYS = {
  guides: 'qaem_rel_guides_v1',
  programs: 'qaem_rel_programs_v1',
  lessons: 'qaem_rel_lessons_v1',
  attendance: 'qaem_rel_attendance_v1',
  questions: 'qaem_rel_questions_v1',
  assessments: 'qaem_rel_assessments_v1',
  progress: 'qaem_rel_progress_v1',
  references: 'qaem_rel_references_v1',
  inquiries: 'qaem_rel_inquiries_v1',
  fiqhSections: 'qaem_rel_fiqh_sections_v1',
};

const DELETED_IDS_KEY = 'qaem_rel_deleted_ids_v1';

function getDeletedIds(): Set<string> {
  const parsed = safeStorage.getJSON<unknown>(DELETED_IDS_KEY, []);
  return new Set(Array.isArray(parsed) ? parsed : []);
}

function addDeletedId(id: string) {
  const set = getDeletedIds();
  set.add(id);
  safeStorage.setJSON(DELETED_IDS_KEY, Array.from(set));
}

function removeDeletedId(id: string) {
  const set = getDeletedIds();
  if (set.has(id)) {
    set.delete(id);
    safeStorage.setJSON(DELETED_IDS_KEY, Array.from(set));
  }
}

function readLocal<T extends { id?: string }>(key: string, fallback: T[]): T[] {
  const deleted = getDeletedIds();
  const filterDeleted = (arr: T[]) =>
    arr.filter((item) => !item?.id || !deleted.has(item.id));
  try {
    const raw = safeStorage.getItem(key);
    if (raw === null) return filterDeleted(fallback);
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? filterDeleted(parsed) : filterDeleted(fallback);
  } catch {
    return filterDeleted(fallback);
  }
}

function writeLocal<T>(key: string, data: T[]) {
  safeStorage.setJSON(key, data);
}

/**
 * Sort Fiqh sections ascending by `order`
 */
export function sortFiqhSections(sections: FiqhSection[]): FiqhSection[] {
  return [...sections].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
}

/**
 * Finds a FiqhSection by its ID, current name, or originalDefaultName
 */
export function findFiqhSection(
  idOrName: string | undefined,
  sections: FiqhSection[] = INITIAL_FIQH_SECTIONS
): FiqhSection | undefined {
  if (!idOrName) return undefined;
  const trimmed = idOrName.trim();
  return (
    sections.find((s) => s.id === trimmed) ||
    sections.find((s) => s.name === trimmed) ||
    sections.find((s) => s.originalDefaultName === trimmed)
  );
}

/**
 * Resolves a sectionId or legacy section name to its current live display name.
 * Ensures that renaming a section updates its displayed title everywhere without losing links.
 */
export function resolveFiqhSectionName(
  idOrName: string | undefined,
  sections: FiqhSection[] = INITIAL_FIQH_SECTIONS
): string {
  if (!idOrName) return sections[0]?.name || 'أحكام الإحرام ومحظوراته';
  const found = findFiqhSection(idOrName, sections);
  return found ? found.name : idOrName;
}

/**
 * Resolves a sectionId or legacy section name to its stable FiqhSection.id
 */
export function resolveFiqhSectionId(
  idOrName: string | undefined,
  sections: FiqhSection[] = INITIAL_FIQH_SECTIONS
): string {
  if (!idOrName) return sections[0]?.id || 'sec-1';
  const found = findFiqhSection(idOrName, sections);
  return found ? found.id : idOrName;
}

/**
 * Reads a pilgrim's mastery status for a given FiqhSection using `section.id` first,
 * falling back to `section.name` or `section.originalDefaultName` for backward compatibility.
 */
export function getPilgrimSectionMastery(
  progress: PilgrimEducationalProgress | undefined,
  section: FiqhSection
): FiqhMasteryStatus {
  if (!progress || !progress.fiqhIssuesMastery) return 'لم يبدأ التعلم';
  return (
    progress.fiqhIssuesMastery[section.id] ||
    progress.fiqhIssuesMastery[section.name] ||
    (section.originalDefaultName
      ? progress.fiqhIssuesMastery[section.originalDefaultName]
      : undefined) ||
    'لم يبدأ التعلم'
  );
}

/**
 * Updates a pilgrim's mastery map keyed strictly by `section.id`
 * and cleans up any legacy name keys for the same section.
 */
export function setPilgrimSectionMastery(
  masteryMap: Record<string, FiqhMasteryStatus>,
  section: FiqhSection,
  status: FiqhMasteryStatus
): Record<string, FiqhMasteryStatus> {
  const next = { ...masteryMap, [section.id]: status };
  if (section.name !== section.id && section.name in next) {
    delete next[section.name];
  }
  if (
    section.originalDefaultName &&
    section.originalDefaultName !== section.id &&
    section.originalDefaultName in next
  ) {
    delete next[section.originalDefaultName];
  }
  return next;
}

export function getPilgrimDisplayName(p: Pilgrim): string {
  if (p.name && p.name.trim()) return p.name.trim();
  const full = `${p.firstName || ''} ${p.secondName || ''} ${p.thirdName || ''} ${p.lastName || ''}`
    .replace(/\s+/g, ' ')
    .trim();
  return full || 'حاج مسجل';
}

export function getPilgrimGroupLabel(p: Pilgrim): string {
  if (p.transport === 'طائرة' || Boolean((p.flightNumberOutbound || '').trim())) {
    return (p.flightNumberOutbound || 'رحلات الطيران').trim();
  }
  return (p.busNumber || 'غير معين بحافلة').trim();
}

export function getPilgrimCampaignLabel(p: Pilgrim): string {
  return (p.selectedPackage || p.packageType || 'الباقة العامة').trim();
}

export function getPilgrimFileNumber(p: Pilgrim): string {
  return (
    p.registrationReference ||
    p.membershipNumber ||
    p.nationalId ||
    p.id ||
    '—'
  ).trim();
}

export function getDefaultGuideFollowUp(
  existing?: PilgrimGuideFollowUp
): PilgrimGuideFollowUp {
  const manasikEducated = Boolean(existing?.manasikEducated);
  const ihramExplained = Boolean(existing?.ihramExplained);
  const tawafSaiExplained = Boolean(existing?.tawafSaiExplained);
  const followedUpDuringManasik = Boolean(existing?.followedUpDuringManasik);
  const tawafCompleted = Boolean(existing?.tawafCompleted);

  let derivedEdu: PilgrimEducationStatus = existing?.educationStatus || 'لم يتم تعليمه بعد';
  if (manasikEducated && ihramExplained && tawafSaiExplained) {
    derivedEdu = 'أتم التعليم';
  } else if (
    manasikEducated ||
    ihramExplained ||
    tawafSaiExplained ||
    followedUpDuringManasik ||
    existing?.educationStatus === 'قيد التعليم'
  ) {
    if (existing?.educationStatus !== 'أتم التعليم') {
      derivedEdu = 'قيد التعليم';
    }
  }

  let derivedTawaf: PilgrimTawafStatus = existing?.tawafStatus || 'لم يتم تطويفه بعد';
  if (tawafCompleted || existing?.tawafStatus === 'أتم التطويف') {
    derivedTawaf = 'أتم التطويف';
  } else if (followedUpDuringManasik && existing?.tawafStatus === 'قيد التطويف') {
    derivedTawaf = 'قيد التطويف';
  }

  return {
    manasikEducated,
    manasikEducatedAt: existing?.manasikEducatedAt,
    ihramExplained,
    ihramExplainedAt: existing?.ihramExplainedAt,
    tawafSaiExplained,
    tawafSaiExplainedAt: existing?.tawafSaiExplainedAt,
    followedUpDuringManasik,
    followedUpDuringManasikAt: existing?.followedUpDuringManasikAt,
    tawafCompleted: derivedTawaf === 'أتم التطويف',
    tawafCompletedAt: existing?.tawafCompletedAt,
    educationStatus: derivedEdu,
    tawafStatus: derivedTawaf,
    guideNotes: existing?.guideNotes || '',
    lastUpdatedAt: existing?.lastUpdatedAt,
    updatedBy: existing?.updatedBy,
    historyLog: Array.isArray(existing?.historyLog) ? existing!.historyLog : [],
  };
}

export interface GuideAssignedPilgrimItem {
  pilgrim: Pilgrim;
  progress: PilgrimEducationalProgress;
  followUp: PilgrimGuideFollowUp;
  assignedAt: string;
}

export interface GuideRealStats {
  guideId: string;
  assignedItems: GuideAssignedPilgrimItem[];
  totalAssigned: number;
  completedEducationCount: number;
  remainingEducationCount: number;
  completedTawafCount: number;
  remainingTawafCount: number;
  educationCompletionPercent: number;
  tawafCompletionPercent: number;
}

/**
 * Computes real-time statistics and assigned pilgrim records for a Religious Guide
 * strictly from actual database records (never using static or random numbers).
 */
export function computeGuideAssignedStats(
  guide: ReligiousGuide,
  activePilgrims: Pilgrim[],
  pilgrimProgressMap: Record<string, PilgrimEducationalProgress>
): GuideRealStats {
  const assignedSet = new Set<string>(guide.assignedPilgrimIds || []);
  const assignedItems: GuideAssignedPilgrimItem[] = [];
  const seenPilgrimKeys = new Set<string>();

  activePilgrims.forEach((p) => {
    const pid = p.id || p.nationalId;
    if (!pid || seenPilgrimKeys.has(pid)) return;
    const pr = pilgrimProgressMap[pid] || (p.nationalId ? pilgrimProgressMap[p.nationalId] : undefined);
    if (!pr) return;

    // A pilgrim is assigned to this guide if pr.assignedGuideId matches guide.id,
    // or if pr.assignedGuideId is unset and guide.assignedPilgrimIds includes pid/nationalId
    const isExplicitlyAssignedToThisGuide =
      pr.assignedGuideId === guide.id ||
      (!pr.assignedGuideId &&
        (assignedSet.has(pid) || (Boolean(p.nationalId) && assignedSet.has(p.nationalId))));

    if (!isExplicitlyAssignedToThisGuide) return;

    seenPilgrimKeys.add(pid);
    const followUp = getDefaultGuideFollowUp(pr.guideFollowUp);
    assignedItems.push({
      pilgrim: p,
      progress: pr,
      followUp,
      assignedAt: pr.assignedGuideAt || guide.createdAt || new Date().toISOString().split('T')[0],
    });
  });

  const totalAssigned = assignedItems.length;
  const completedEducationCount = assignedItems.filter(
    (item) => item.followUp.educationStatus === 'أتم التعليم'
  ).length;
  const remainingEducationCount = Math.max(0, totalAssigned - completedEducationCount);

  const completedTawafCount = assignedItems.filter(
    (item) =>
      item.followUp.tawafCompleted || item.followUp.tawafStatus === 'أتم التطويف'
  ).length;
  const remainingTawafCount = Math.max(0, totalAssigned - completedTawafCount);

  const educationCompletionPercent =
    totalAssigned > 0 ? Math.round((completedEducationCount / totalAssigned) * 100) : 0;
  const tawafCompletionPercent =
    totalAssigned > 0 ? Math.round((completedTawafCount / totalAssigned) * 100) : 0;

  return {
    guideId: guide.id,
    assignedItems,
    totalAssigned,
    completedEducationCount,
    remainingEducationCount,
    completedTawafCount,
    remainingTawafCount,
    educationCompletionPercent,
    tawafCompletionPercent,
  };
}

/**
 * Generates or retrieves the educational profile for an existing Pilgrim
 * without duplicating Pilgrim records in the database.
 * Links Fiqh mastery strictly by `section.id` while migrating any legacy section names.
 */
export function buildOrMergePilgrimProgress(
  pilgrim: Pilgrim,
  storedProgressList: PilgrimEducationalProgress[],
  attendanceList: LessonAttendanceRecord[],
  lessons: ReligiousLesson[],
  programs: AwarenessProgram[],
  fiqhSections: FiqhSection[] = INITIAL_FIQH_SECTIONS
): PilgrimEducationalProgress {
  const pid = pilgrim.id || pilgrim.nationalId;
  const existing = storedProgressList.find(
    (pr) => pr.pilgrimId === pid || pr.nationalId === pilgrim.nationalId
  );

  // Attended lessons for this pilgrim
  const attendedLessonIds = Array.from(
    new Set(
      attendanceList
        .filter(
          (a) =>
            (a.pilgrimId === pid || a.nationalId === pilgrim.nationalId) &&
            a.status === 'حاضر'
        )
        .map((a) => a.lessonId)
    )
  );

  const hash = (pilgrim.nationalId || pid || '0')
    .split('')
    .reduce((acc, ch) => acc + ch.charCodeAt(0), 0);

  if (existing) {
    const mergedCompletedLessons = Array.from(
      new Set([...(existing.completedLessonIds || []), ...attendedLessonIds])
    );
    // Normalize fiqhIssuesMastery keys to section.id so renaming never loses mastery
    const normalizedMastery: Record<string, FiqhMasteryStatus> = {
      ...(existing.fiqhIssuesMastery || {}),
    };
    fiqhSections.forEach((sec) => {
      const st = getPilgrimSectionMastery(existing, sec);
      normalizedMastery[sec.id] = st;
      if (sec.name !== sec.id && sec.name in normalizedMastery) {
        delete normalizedMastery[sec.name];
      }
      if (
        sec.originalDefaultName &&
        sec.originalDefaultName !== sec.id &&
        sec.originalDefaultName in normalizedMastery
      ) {
        delete normalizedMastery[sec.originalDefaultName];
      }
    });

    return {
      ...existing,
      guideFollowUp: getDefaultGuideFollowUp(existing.guideFollowUp),
      fiqhIssuesMastery: normalizedMastery,
      completedLessonIds: mergedCompletedLessons,
    };
  }

  // Deterministic realistic baseline progress for active pilgrims who haven't been customized yet
  const defaultMastery: Record<string, FiqhMasteryStatus> = {};
  fiqhSections.forEach((sec, idx) => {
    const mod = (hash + idx) % 5;
    if (mod === 0 || mod === 1) {
      defaultMastery[sec.id] = 'اجتاز التقييم';
    } else if (mod === 2) {
      defaultMastery[sec.id] = 'أكمل المادة التعليمية';
    } else if (mod === 3) {
      defaultMastery[sec.id] = 'بدأ التعلم';
    } else {
      defaultMastery[sec.id] = idx < 3 ? 'يحتاج إلى مراجعة وإعادة توعية' : 'لم يبدأ التعلم';
    }
  });

  const preScore = 55 + (hash % 25); // 55 - 79
  const postScore = Math.min(100, preScore + 18 + (hash % 12)); // 73 - 100
  const needsReeducation =
    postScore < 75 ||
    Object.values(defaultMastery).some((st) => st === 'يحتاج إلى مراجعة وإعادة توعية');

  const enrolledIds = programs.filter((pr) => pr.isActive).map((pr) => pr.id);
  const completedProgIds =
    postScore >= 80 && enrolledIds.length > 0 ? [enrolledIds[0]] : [];

  const completedLessons =
    attendedLessonIds.length > 0
      ? attendedLessonIds
      : lessons
          .filter((l) => l.status === 'مكتمل')
          .slice(0, (hash % 2) + 1)
          .map((l) => l.id);

  const firstSec = fiqhSections[0] || INITIAL_FIQH_SECTIONS[0];

  return {
    id: `prog-${pilgrim.nationalId || pid}`,
    pilgrimId: pid,
    nationalId: pilgrim.nationalId,
    preferredLanguage: 'العربية',
    enrolledProgramIds: enrolledIds,
    completedProgramIds: completedProgIds,
    completedLessonIds: completedLessons,
    preTestScore: preScore,
    postTestScore: postScore,
    fiqhIssuesMastery: defaultMastery,
    assessmentAttempts: [
      {
        id: `att-pre-${pilgrim.nationalId}`,
        assessmentId: 'assess-pre-1',
        assessmentTitle: 'الاختبار القبلي لقياس المعرفة الفقهية الأساسية للمناسك',
        assessmentPhaseType: 'اختبار قبلي',
        sectionId: firstSec.id,
        chapter: firstSec.name,
        score: preScore,
        passed: preScore >= 70,
        attemptNumber: 1,
        completedAt: '2026-11-05',
      },
      {
        id: `att-post-${pilgrim.nationalId}`,
        assessmentId: 'assess-post-1',
        assessmentTitle: 'الاختبار البعدي لإتقان أحكام الإحرام والمواقيت والطواف والسعي',
        assessmentPhaseType: 'اختبار بعدي',
        sectionId: firstSec.id,
        chapter: firstSec.name,
        score: postScore,
        passed: postScore >= 75,
        attemptNumber: 1,
        completedAt: '2026-11-14',
      },
    ],
    followUpLog: [],
    guideFollowUp: getDefaultGuideFollowUp(),
    needsReeducation,
    lastUpdated: new Date().toISOString().split('T')[0],
  };
}

/**
 * Subscribe to all Religious Guidance collections with automatic local cache + seed fallback
 */
export function useReligiousGuidanceStoreInit(callbacks: {
  onGuides: (items: ReligiousGuide[]) => void;
  onPrograms: (items: AwarenessProgram[]) => void;
  onLessons: (items: ReligiousLesson[]) => void;
  onAttendance: (items: LessonAttendanceRecord[]) => void;
  onQuestions: (items: AssessmentQuestion[]) => void;
  onAssessments: (items: ReligiousAssessment[]) => void;
  onProgress: (items: PilgrimEducationalProgress[]) => void;
  onReferences: (items: ReligiousReferenceMaterial[]) => void;
  onInquiries: (items: ShariaInquiry[]) => void;
  onFiqhSections?: (items: FiqhSection[]) => void;
}) {
  // Initial baseline in memory while real-time Firestore listeners connect
  callbacks.onGuides(INITIAL_RELIGIOUS_GUIDES);
  callbacks.onPrograms(INITIAL_AWARENESS_PROGRAMS);
  callbacks.onLessons(INITIAL_RELIGIOUS_LESSONS);
  callbacks.onAttendance([]);
  callbacks.onQuestions(INITIAL_ASSESSMENT_QUESTIONS);
  callbacks.onAssessments(INITIAL_ASSESSMENTS);
  callbacks.onProgress([]);
  callbacks.onReferences(INITIAL_REFERENCE_MATERIALS);
  callbacks.onInquiries(INITIAL_SHARIA_INQUIRIES);
  if (callbacks.onFiqhSections) {
    callbacks.onFiqhSections(sortFiqhSections(INITIAL_FIQH_SECTIONS));
  }

  let hasSeededFirestoreSections = false;

  const unsubs = [
    subscribeToCollection<ReligiousGuide>('religious_guides', (docs) => {
      if (docs.length > 0) {
        const deleted = getDeletedIds();
        const filtered = docs.filter((d) => !deleted.has(d.id));
        writeLocal(STORAGE_KEYS.guides, filtered);
        callbacks.onGuides(filtered);
      }
    }),
    subscribeToCollection<AwarenessProgram>('religious_programs', (docs) => {
      if (docs.length > 0) {
        writeLocal(STORAGE_KEYS.programs, docs);
        callbacks.onPrograms(docs);
      }
    }),
    subscribeToCollection<ReligiousLesson>('religious_lessons', (docs) => {
      if (docs.length > 0) {
        writeLocal(STORAGE_KEYS.lessons, docs);
        callbacks.onLessons(docs);
      }
    }),
    subscribeToCollection<LessonAttendanceRecord>('religious_attendance', (docs) => {
      writeLocal(STORAGE_KEYS.attendance, docs);
      callbacks.onAttendance(docs);
    }),
    subscribeToCollection<AssessmentQuestion>('religious_questions', (docs) => {
      if (docs.length > 0) {
        writeLocal(STORAGE_KEYS.questions, docs);
        callbacks.onQuestions(docs);
      }
    }),
    subscribeToCollection<ReligiousAssessment>('religious_assessments', (docs) => {
      if (docs.length > 0) {
        writeLocal(STORAGE_KEYS.assessments, docs);
        callbacks.onAssessments(docs);
      }
    }),
    subscribeToCollection<PilgrimEducationalProgress>('religious_pilgrim_progress', (docs) => {
      writeLocal(STORAGE_KEYS.progress, docs);
      callbacks.onProgress(docs);
    }),
    subscribeToCollection<ReligiousReferenceMaterial>('religious_references', (docs) => {
      if (docs.length > 0) {
        writeLocal(STORAGE_KEYS.references, docs);
        callbacks.onReferences(docs);
      }
    }),
    subscribeToCollection<ShariaInquiry>('religious_inquiries', (docs) => {
      if (docs.length > 0) {
        writeLocal(STORAGE_KEYS.inquiries, docs);
        callbacks.onInquiries(docs);
      }
    }),
    subscribeToCollection<FiqhSection>('religious_fiqh_sections', (docs) => {
      const deleted = getDeletedIds();
      if (docs.length > 0) {
        const filtered = sortFiqhSections(docs.filter((d) => !deleted.has(d.id)));
        writeLocal(STORAGE_KEYS.fiqhSections, filtered);
        callbacks.onFiqhSections?.(filtered);
      } else if (!hasSeededFirestoreSections && (typeof navigator === 'undefined' || navigator.onLine)) {
        hasSeededFirestoreSections = true;
        const seedSections = sortFiqhSections(INITIAL_FIQH_SECTIONS);
        callbacks.onFiqhSections?.(seedSections);
        seedSections.forEach((sec) => {
          setDocument('religious_fiqh_sections', sec.id, sec);
        });
      }
    }),
  ];

  return () => {
    unsubs.forEach((u) => u());
  };
}

export async function saveReligiousItem<T extends { id: string }>(
  collectionName:
    | 'religious_guides'
    | 'religious_programs'
    | 'religious_lessons'
    | 'religious_attendance'
    | 'religious_questions'
    | 'religious_assessments'
    | 'religious_pilgrim_progress'
    | 'religious_references'
    | 'religious_inquiries'
    | 'religious_fiqh_sections',
  storageKeyKey: keyof typeof STORAGE_KEYS,
  item: T,
  currentList: T[],
  setList: React.Dispatch<React.SetStateAction<T[]>>
) {
  removeDeletedId(item.id);
  const nextList = (() => {
    const idx = currentList.findIndex((x) => x.id === item.id);
    if (idx >= 0) {
      const copy = [...currentList];
      copy[idx] = item;
      return copy;
    }
    return [...currentList, item];
  })();

  setList(nextList);
  writeLocal(STORAGE_KEYS[storageKeyKey], nextList);
  await setDocument(collectionName, item.id, item);
}

export async function saveFiqhSectionsBatch(
  orderedSections: FiqhSection[],
  setSections: React.Dispatch<React.SetStateAction<FiqhSection[]>>
) {
  const normalized = orderedSections.map((sec, idx) => ({
    ...sec,
    order: idx + 1,
    updatedAt: new Date().toISOString().split('T')[0],
  }));
  setSections(normalized);
  writeLocal(STORAGE_KEYS.fiqhSections, normalized);
  await Promise.all(
    normalized.map((sec) => setDocument('religious_fiqh_sections', sec.id, sec))
  );
}

export async function deleteReligiousItem<T extends { id: string }>(
  collectionName:
    | 'religious_guides'
    | 'religious_programs'
    | 'religious_lessons'
    | 'religious_attendance'
    | 'religious_questions'
    | 'religious_assessments'
    | 'religious_pilgrim_progress'
    | 'religious_references'
    | 'religious_inquiries'
    | 'religious_fiqh_sections',
  storageKeyKey: keyof typeof STORAGE_KEYS,
  id: string,
  currentList: T[],
  setList: React.Dispatch<React.SetStateAction<T[]>>
) {
  addDeletedId(id);
  const nextList = currentList.filter((x) => x.id !== id);
  setList(nextList);
  writeLocal(STORAGE_KEYS[storageKeyKey], nextList);
  await removeDocument(collectionName, id);
}

/**
 * Safely deletes a FiqhSection while reassigning all linked questions, programs, lessons,
 * references, inquiries, and pilgrim mastery records to a fallback FiqhSection so no data is lost.
 */
export async function deleteFiqhSectionSafely(params: {
  sectionToDelete: FiqhSection;
  fallbackSection: FiqhSection;
  currentSections: FiqhSection[];
  setSections: React.Dispatch<React.SetStateAction<FiqhSection[]>>;
  questions: AssessmentQuestion[];
  setQuestions: React.Dispatch<React.SetStateAction<AssessmentQuestion[]>>;
  programs: AwarenessProgram[];
  setPrograms: React.Dispatch<React.SetStateAction<AwarenessProgram[]>>;
  lessons: ReligiousLesson[];
  setLessons: React.Dispatch<React.SetStateAction<ReligiousLesson[]>>;
  references: ReligiousReferenceMaterial[];
  setReferences: React.Dispatch<React.SetStateAction<ReligiousReferenceMaterial[]>>;
  inquiries: ShariaInquiry[];
  setInquiries: React.Dispatch<React.SetStateAction<ShariaInquiry[]>>;
  storedProgressList: PilgrimEducationalProgress[];
  setStoredProgressList: React.Dispatch<React.SetStateAction<PilgrimEducationalProgress[]>>;
}) {
  const {
    sectionToDelete,
    fallbackSection,
    currentSections,
    setSections,
    questions,
    setQuestions,
    programs,
    setPrograms,
    lessons,
    setLessons,
    references,
    setReferences,
    inquiries,
    setInquiries,
    storedProgressList,
    setStoredProgressList,
  } = params;

  const isLinkedToDeleted = (secId?: string, legacyName?: string) => {
    return (
      secId === sectionToDelete.id ||
      legacyName === sectionToDelete.id ||
      legacyName === sectionToDelete.name ||
      (Boolean(sectionToDelete.originalDefaultName) &&
        legacyName === sectionToDelete.originalDefaultName)
    );
  };

  // 1. Reassign linked questions
  const updatedQuestions: AssessmentQuestion[] = [];
  const changedQuestions: AssessmentQuestion[] = [];
  questions.forEach((q) => {
    if (isLinkedToDeleted(q.sectionId, q.chapter)) {
      const nextQ: AssessmentQuestion = {
        ...q,
        sectionId: fallbackSection.id,
        chapter: fallbackSection.name,
      };
      updatedQuestions.push(nextQ);
      changedQuestions.push(nextQ);
    } else {
      updatedQuestions.push(q);
    }
  });
  if (changedQuestions.length > 0) {
    setQuestions(updatedQuestions);
    writeLocal(STORAGE_KEYS.questions, updatedQuestions);
    await Promise.all(
      changedQuestions.map((q) => setDocument('religious_questions', q.id, q))
    );
  }

  // 2. Reassign linked programs
  const updatedPrograms: AwarenessProgram[] = [];
  const changedPrograms: AwarenessProgram[] = [];
  programs.forEach((prog) => {
    if (isLinkedToDeleted(prog.sectionId, prog.topicCategory)) {
      const nextProg: AwarenessProgram = {
        ...prog,
        sectionId: fallbackSection.id,
        topicCategory: fallbackSection.name,
      };
      updatedPrograms.push(nextProg);
      changedPrograms.push(nextProg);
    } else {
      updatedPrograms.push(prog);
    }
  });
  if (changedPrograms.length > 0) {
    setPrograms(updatedPrograms);
    writeLocal(STORAGE_KEYS.programs, updatedPrograms);
    await Promise.all(
      changedPrograms.map((p) => setDocument('religious_programs', p.id, p))
    );
  }

  // 3. Reassign linked lessons
  const updatedLessons: ReligiousLesson[] = [];
  const changedLessons: ReligiousLesson[] = [];
  lessons.forEach((l) => {
    if (isLinkedToDeleted(l.sectionId, l.category)) {
      const nextL: ReligiousLesson = {
        ...l,
        sectionId: fallbackSection.id,
        category: fallbackSection.name,
      };
      updatedLessons.push(nextL);
      changedLessons.push(nextL);
    } else {
      updatedLessons.push(l);
    }
  });
  if (changedLessons.length > 0) {
    setLessons(updatedLessons);
    writeLocal(STORAGE_KEYS.lessons, updatedLessons);
    await Promise.all(
      changedLessons.map((l) => setDocument('religious_lessons', l.id, l))
    );
  }

  // 4. Reassign linked references
  const updatedRefs: ReligiousReferenceMaterial[] = [];
  const changedRefs: ReligiousReferenceMaterial[] = [];
  references.forEach((ref) => {
    if (isLinkedToDeleted(ref.sectionId, ref.category)) {
      const nextRef: ReligiousReferenceMaterial = {
        ...ref,
        sectionId: fallbackSection.id,
        category: fallbackSection.name,
      };
      updatedRefs.push(nextRef);
      changedRefs.push(nextRef);
    } else {
      updatedRefs.push(ref);
    }
  });
  if (changedRefs.length > 0) {
    setReferences(updatedRefs);
    writeLocal(STORAGE_KEYS.references, updatedRefs);
    await Promise.all(
      changedRefs.map((r) => setDocument('religious_references', r.id, r))
    );
  }

  // 5. Reassign linked inquiries
  const updatedInquiries: ShariaInquiry[] = [];
  const changedInquiries: ShariaInquiry[] = [];
  inquiries.forEach((inq) => {
    if (isLinkedToDeleted(inq.sectionId, inq.category)) {
      const nextInq: ShariaInquiry = {
        ...inq,
        sectionId: fallbackSection.id,
        category: fallbackSection.name,
      };
      updatedInquiries.push(nextInq);
      changedInquiries.push(nextInq);
    } else {
      updatedInquiries.push(inq);
    }
  });
  if (changedInquiries.length > 0) {
    setInquiries(updatedInquiries);
    writeLocal(STORAGE_KEYS.inquiries, updatedInquiries);
    await Promise.all(
      changedInquiries.map((i) => setDocument('religious_inquiries', i.id, i))
    );
  }

  // 6. Migrate pilgrim mastery status if needed so no evaluation record is lost
  const updatedProgress: PilgrimEducationalProgress[] = [];
  const changedProgress: PilgrimEducationalProgress[] = [];
  storedProgressList.forEach((pr) => {
    const oldStatus = getPilgrimSectionMastery(pr, sectionToDelete);
    const hasKey =
      sectionToDelete.id in (pr.fiqhIssuesMastery || {}) ||
      sectionToDelete.name in (pr.fiqhIssuesMastery || {}) ||
      (sectionToDelete.originalDefaultName
        ? sectionToDelete.originalDefaultName in (pr.fiqhIssuesMastery || {})
        : false);

    if (hasKey) {
      const nextMap = { ...(pr.fiqhIssuesMastery || {}) };
      delete nextMap[sectionToDelete.id];
      delete nextMap[sectionToDelete.name];
      if (sectionToDelete.originalDefaultName) {
        delete nextMap[sectionToDelete.originalDefaultName];
      }
      // Preserve evaluation on fallback section if fallback was still 'لم يبدأ التعلم'
      const fallbackCurrent = getPilgrimSectionMastery(pr, fallbackSection);
      if (fallbackCurrent === 'لم يبدأ التعلم' && oldStatus !== 'لم يبدأ التعلم') {
        nextMap[fallbackSection.id] = oldStatus;
      }
      const nextPr: PilgrimEducationalProgress = {
        ...pr,
        fiqhIssuesMastery: nextMap,
      };
      updatedProgress.push(nextPr);
      changedProgress.push(nextPr);
    } else {
      updatedProgress.push(pr);
    }
  });
  if (changedProgress.length > 0) {
    setStoredProgressList(updatedProgress);
    writeLocal(STORAGE_KEYS.progress, updatedProgress);
    await Promise.all(
      changedProgress.map((p) => setDocument('religious_pilgrim_progress', p.id, p))
    );
  }

  // 7. Delete the section and re-normalize order of remaining sections
  addDeletedId(sectionToDelete.id);
  const remaining = currentSections
    .filter((s) => s.id !== sectionToDelete.id)
    .map((s, idx) => ({ ...s, order: idx + 1 }));
  setSections(remaining);
  writeLocal(STORAGE_KEYS.fiqhSections, remaining);
  await removeDocument('religious_fiqh_sections', sectionToDelete.id);
  await Promise.all(
    remaining.map((sec) => setDocument('religious_fiqh_sections', sec.id, sec))
  );
}

/**
 * Restores any missing default 14 Fiqh sections without deleting custom sections or data.
 */
export async function restoreDefaultFiqhSections(
  currentSections: FiqhSection[],
  setSections: React.Dispatch<React.SetStateAction<FiqhSection[]>>
) {
  INITIAL_FIQH_SECTIONS.forEach((def) => removeDeletedId(def.id));
  const mapById = new Map<string, FiqhSection>();
  currentSections.forEach((s) => mapById.set(s.id, s));

  INITIAL_FIQH_SECTIONS.forEach((def) => {
    if (!mapById.has(def.id)) {
      mapById.set(def.id, { ...def, isVisible: true });
    }
  });

  const merged = sortFiqhSections(Array.from(mapById.values())).map((s, idx) => ({
    ...s,
    order: idx + 1,
  }));

  setSections(merged);
  writeLocal(STORAGE_KEYS.fiqhSections, merged);
  await Promise.all(
    merged.map((sec) => setDocument('religious_fiqh_sections', sec.id, sec))
  );
}

/**
 * Sends or schedules an educational/awareness notification strictly through the EXISTING
 * notification engine (`createAndDispatchNotification` from `src/lib/notifications.ts`).
 */
export async function dispatchReligiousAwarenessNotification(params: {
  title: string;
  body: string;
  priority?: 'urgent' | 'high' | 'normal';
  targetType: 'all' | 'package' | 'bus' | 'flight' | 'gender' | 'individual';
  targetValue?: string;
  deliveryType?: 'instant' | 'scheduled';
  scheduledAt?: string;
  senderName: string;
  activePilgrims: Pilgrim[];
  auditActionLabel: string;
}): Promise<NotificationItem> {
  const nowIso = new Date().toISOString();
  const notifId = `notif-rel-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const notificationItem: NotificationItem = {
    id: notifId,
    title: params.title,
    body: params.body,
    priority: params.priority || 'high',
    targetType: params.targetType,
    targetValue: params.targetValue || '',
    deliveryType: params.deliveryType || 'instant',
    scheduledAt: params.scheduledAt,
    status: params.deliveryType === 'scheduled' ? 'scheduled' : 'sent',
    createdBy: {
      adminId: 'religious-guidance',
      adminName: params.senderName,
      role: 'الإشراف الديني',
    },
    createdAt: nowIso,
    sentAt: params.deliveryType === 'scheduled' ? undefined : nowIso,
    stats: {
      targetCount: 0,
      sentCount: 0,
      readCount: 0,
      failureCount: 0,
    },
  };

  await createAndDispatchNotification(notificationItem, params.activePilgrims);

  await recordActivityLog({
    adminName: params.senderName,
    userRole: 'الإشراف الديني',
    category: 'الباقات والإعلانات',
    action: params.auditActionLabel,
    target: params.title,
    details: `تم إرسال/جدولة الإشعار التوعوي عبر نظام الإشعارات الموحد (${notifId}) إلى: ${params.targetValue || 'جميع الحجاج'}`,
  });

  return notificationItem;
}

/**
 * Exports any tabular religious guidance report or attendance sheet to an official styled Al-Qaem Excel (.xlsx) file
 */
export function exportReligiousReportCSV(
  filenamePrefix: string,
  headers: string[],
  rows: (string | number)[][],
  summaryCards?: AlQaemExcelSummaryItem[],
  customTitle?: string,
  customSubtitle?: string
) {
  const dateStr = new Date().toISOString().split('T')[0];
  const fullFilename = `${filenamePrefix}_${dateStr}`;
  const inferred = inferReportMetadataFromFilename(filenamePrefix, headers);

  void exportAlQaemExcelReport({
    reportTitle: customTitle || inferred.title,
    subtitle: customSubtitle || inferred.subtitle,
    category: 'منظومة الإرشاد الديني والتوعية',
    filename: fullFilename,
    columns: headers,
    rows,
    summaryCards,
  });
}

/**
 * Assigns one or multiple pilgrims to a specific Religious Guide in the database,
 * preventing duplicate assignments and ensuring each pilgrim has a single clear responsible guide.
 * Also synchronizes the real assigned pilgrim count across all modified guides.
 */
export async function assignPilgrimsToGuideBatch(params: {
  targetGuide: ReligiousGuide;
  pilgrimsToAssign: Pilgrim[];
  activePilgrims: Pilgrim[];
  pilgrimProgressMap: Record<string, PilgrimEducationalProgress>;
  storedProgressList: PilgrimEducationalProgress[];
  setStoredProgressList: React.Dispatch<React.SetStateAction<PilgrimEducationalProgress[]>>;
  guides: ReligiousGuide[];
  setGuides: React.Dispatch<React.SetStateAction<ReligiousGuide[]>>;
  actorName: string;
}): Promise<{ assignedCount: number; transferredCount: number }> {
  const {
    targetGuide,
    pilgrimsToAssign,
    pilgrimProgressMap,
    storedProgressList,
    setStoredProgressList,
    guides,
    setGuides,
    actorName,
  } = params;

  const today = new Date().toISOString().split('T')[0];
  const nowStamp = new Date().toLocaleString('ar-SA');
  const progressById = new Map<string, PilgrimEducationalProgress>();
  storedProgressList.forEach((pr) => progressById.set(pr.id, pr));

  const changedProgress: PilgrimEducationalProgress[] = [];
  let assignedCount = 0;
  let transferredCount = 0;

  pilgrimsToAssign.forEach((pilgrim) => {
    const pid = pilgrim.id || pilgrim.nationalId;
    if (!pid) return;
    const basePr =
      pilgrimProgressMap[pid] ||
      (pilgrim.nationalId ? pilgrimProgressMap[pilgrim.nationalId] : undefined);
    if (!basePr) return;

    // Prevent duplicate assignment to the exact same guide
    if (basePr.assignedGuideId === targetGuide.id) {
      return;
    }

    const wasAssignedToOther = Boolean(
      basePr.assignedGuideId && basePr.assignedGuideId !== targetGuide.id
    );
    if (wasAssignedToOther) {
      transferredCount++;
    } else {
      assignedCount++;
    }

    const prevFollowUp = getDefaultGuideFollowUp(basePr.guideFollowUp);
    const auditEntry = {
      id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: nowStamp,
      authorName: actorName,
      guideId: targetGuide.id,
      guideName: targetGuide.name,
      actionSummary: wasAssignedToOther
        ? `نقل إسناد الحاج من (${basePr.assignedGuideName || 'مرشد سابق'}) إلى (${targetGuide.name})`
        : `إسناد الحاج إلى المرشد الديني (${targetGuide.name})`,
    };

    const updatedPr: PilgrimEducationalProgress = {
      ...basePr,
      assignedGuideId: targetGuide.id,
      assignedGuideName: targetGuide.name,
      assignedGuideAt: today,
      guideFollowUp: {
        ...prevFollowUp,
        lastUpdatedAt: today,
        updatedBy: actorName,
        historyLog: [auditEntry, ...prevFollowUp.historyLog],
      },
      lastUpdated: today,
    };

    progressById.set(updatedPr.id, updatedPr);
    changedProgress.push(updatedPr);
  });

  if (changedProgress.length === 0) {
    return { assignedCount: 0, transferredCount: 0 };
  }

  const nextProgressList = Array.from(progressById.values());
  setStoredProgressList(nextProgressList);
  writeLocal(STORAGE_KEYS.progress, nextProgressList);
  await Promise.all(
    changedProgress.map((pr) => setDocument('religious_pilgrim_progress', pr.id, pr))
  );

  // Build updated progress lookup to sync guide counts and assignedPilgrimIds
  const nextMap: Record<string, PilgrimEducationalProgress> = { ...pilgrimProgressMap };
  changedProgress.forEach((pr) => {
    nextMap[pr.pilgrimId] = pr;
    if (pr.nationalId) nextMap[pr.nationalId] = pr;
  });

  const nextGuides = guides.map((g) => {
    const assignedPilgrimIds = params.activePilgrims
      .filter((p) => {
        const pid = p.id || p.nationalId;
        const pr = nextMap[pid] || (p.nationalId ? nextMap[p.nationalId] : undefined);
        return pr?.assignedGuideId === g.id;
      })
      .map((p) => p.id || p.nationalId);

    return {
      ...g,
      assignedPilgrimIds,
      pilgrimsEducatedCount: assignedPilgrimIds.length,
      updatedAt: today,
    };
  });

  setGuides(nextGuides);
  writeLocal(STORAGE_KEYS.guides, nextGuides);
  await Promise.all(
    nextGuides.map((g) => setDocument('religious_guides', g.id, g))
  );

  return { assignedCount, transferredCount };
}

/**
 * Unassigns a pilgrim from their current Religious Guide and updates the database counts.
 */
export async function unassignPilgrimFromGuide(params: {
  pilgrim: Pilgrim;
  guide: ReligiousGuide;
  activePilgrims: Pilgrim[];
  pilgrimProgressMap: Record<string, PilgrimEducationalProgress>;
  storedProgressList: PilgrimEducationalProgress[];
  setStoredProgressList: React.Dispatch<React.SetStateAction<PilgrimEducationalProgress[]>>;
  guides: ReligiousGuide[];
  setGuides: React.Dispatch<React.SetStateAction<ReligiousGuide[]>>;
  actorName: string;
}) {
  const {
    pilgrim,
    guide,
    activePilgrims,
    pilgrimProgressMap,
    storedProgressList,
    setStoredProgressList,
    guides,
    setGuides,
    actorName,
  } = params;

  const pid = pilgrim.id || pilgrim.nationalId;
  const basePr =
    pilgrimProgressMap[pid] ||
    (pilgrim.nationalId ? pilgrimProgressMap[pilgrim.nationalId] : undefined);
  if (!basePr) return;

  const today = new Date().toISOString().split('T')[0];
  const nowStamp = new Date().toLocaleString('ar-SA');
  const prevFollowUp = getDefaultGuideFollowUp(basePr.guideFollowUp);

  const updatedPr: PilgrimEducationalProgress = {
    ...basePr,
    assignedGuideId: '',
    assignedGuideName: '',
    assignedGuideAt: '',
    guideFollowUp: {
      ...prevFollowUp,
      lastUpdatedAt: today,
      updatedBy: actorName,
      historyLog: [
        {
          id: `aud-unassign-${Date.now()}`,
          timestamp: nowStamp,
          authorName: actorName,
          guideId: guide.id,
          guideName: guide.name,
          actionSummary: `إلغاء إسناد الحاج من مسؤولية المرشد (${guide.name})`,
        },
        ...prevFollowUp.historyLog,
      ],
    },
    lastUpdated: today,
  };

  const progressById = new Map<string, PilgrimEducationalProgress>();
  storedProgressList.forEach((pr) => progressById.set(pr.id, pr));
  progressById.set(updatedPr.id, updatedPr);

  const nextProgressList = Array.from(progressById.values());
  setStoredProgressList(nextProgressList);
  writeLocal(STORAGE_KEYS.progress, nextProgressList);
  await setDocument('religious_pilgrim_progress', updatedPr.id, updatedPr);

  const nextMap: Record<string, PilgrimEducationalProgress> = {
    ...pilgrimProgressMap,
    [pid]: updatedPr,
  };
  if (pilgrim.nationalId) nextMap[pilgrim.nationalId] = updatedPr;

  const nextGuides = guides.map((g) => {
    const assignedPilgrimIds = activePilgrims
      .filter((p) => {
        const key = p.id || p.nationalId;
        const pr = nextMap[key] || (p.nationalId ? nextMap[p.nationalId] : undefined);
        return pr?.assignedGuideId === g.id;
      })
      .map((p) => p.id || p.nationalId);

    return {
      ...g,
      assignedPilgrimIds,
      pilgrimsEducatedCount: assignedPilgrimIds.length,
      updatedAt: today,
    };
  });

  setGuides(nextGuides);
  writeLocal(STORAGE_KEYS.guides, nextGuides);
  await Promise.all(
    nextGuides.map((g) => setDocument('religious_guides', g.id, g))
  );
}

/**
 * Updates a pilgrim's guide follow-up & achievement record (manasik, ihram, tawaf & sai,
 * field follow-up, tawaf completion, dates, and guide notes) while preserving full history.
 */
export async function savePilgrimGuideFollowUp(params: {
  pilgrim: Pilgrim;
  guide: ReligiousGuide;
  nextFollowUp: PilgrimGuideFollowUp;
  actionSummary: string;
  pilgrimProgressMap: Record<string, PilgrimEducationalProgress>;
  storedProgressList: PilgrimEducationalProgress[];
  setStoredProgressList: React.Dispatch<React.SetStateAction<PilgrimEducationalProgress[]>>;
  actorName: string;
}) {
  const {
    pilgrim,
    guide,
    nextFollowUp,
    actionSummary,
    pilgrimProgressMap,
    storedProgressList,
    setStoredProgressList,
    actorName,
  } = params;

  const pid = pilgrim.id || pilgrim.nationalId;
  const basePr =
    pilgrimProgressMap[pid] ||
    (pilgrim.nationalId ? pilgrimProgressMap[pilgrim.nationalId] : undefined);
  if (!basePr) return;

  const today = new Date().toISOString().split('T')[0];
  const nowStamp = new Date().toLocaleString('ar-SA');
  const prevHistory = Array.isArray(basePr.guideFollowUp?.historyLog)
    ? basePr.guideFollowUp!.historyLog
    : [];

  const auditEntry = {
    id: `aud-flw-${Date.now()}`,
    timestamp: nowStamp,
    authorName: actorName,
    guideId: guide.id,
    guideName: guide.name,
    actionSummary,
    notes: nextFollowUp.guideNotes || undefined,
  };

  const normalizedFollowUp: PilgrimGuideFollowUp = {
    ...nextFollowUp,
    lastUpdatedAt: today,
    updatedBy: actorName,
    historyLog: [auditEntry, ...prevHistory],
  };

  const updatedPr: PilgrimEducationalProgress = {
    ...basePr,
    assignedGuideId: basePr.assignedGuideId || guide.id,
    assignedGuideName: basePr.assignedGuideName || guide.name,
    assignedGuideAt: basePr.assignedGuideAt || today,
    guideFollowUp: normalizedFollowUp,
    lastUpdated: today,
  };

  const progressById = new Map<string, PilgrimEducationalProgress>();
  storedProgressList.forEach((pr) => progressById.set(pr.id, pr));
  progressById.set(updatedPr.id, updatedPr);

  const nextProgressList = Array.from(progressById.values());
  setStoredProgressList(nextProgressList);
  writeLocal(STORAGE_KEYS.progress, nextProgressList);
  await setDocument('religious_pilgrim_progress', updatedPr.id, updatedPr);
}

// ============================================================================
// وحدة إدارة المطوّفين وتوزيع الحجاج (Mutawwif Assignment & Smart Distribution)
// ============================================================================

export interface MutawwifPilgrimItem {
  pilgrim: Pilgrim;
  pilgrimKey: string;
  progress: PilgrimEducationalProgress;
  assignedMutawwifId: string;
  assignedMutawwifName: string;
  assignedMutawwifAt: string;
  familyClusterId: string;
  familyClusterSize: number;
}

export interface MutawwifRealStats {
  mutawwif: ReligiousGuide;
  assignedItems: MutawwifPilgrimItem[];
  totalAssigned: number;
  maleCount: number;
  femaleCount: number;
  wheelchairOrAssistCount: number;
  marjiCounts: Record<string, number>;
}

export function getPilgrimEffectiveMarji(pilgrim: Pilgrim): string {
  const custom = (pilgrim.customMarji || '').trim();
  const curr = (pilgrim.currentMarji || '').trim();
  if (curr === 'مرجع آخر' || curr === 'أخرى') {
    return custom || curr || 'غير محدد';
  }
  return curr || custom || 'غير محدد';
}

export function getPilgrimHealthSummary(pilgrim: Pilgrim): string {
  const parts: string[] = [];
  if (pilgrim.mobilityIndependence && pilgrim.mobilityIndependence.trim() && pilgrim.mobilityIndependence !== 'مستقل بالكامل' && pilgrim.mobilityIndependence !== 'نعم') {
    parts.push(pilgrim.mobilityIndependence.trim());
  }
  if (pilgrim.needsAssistance) {
    parts.push('يحتاج مساعدة حركية / كرسي متحرك');
  }
  if (pilgrim.hasBackPain) {
    parts.push('آلام ظهر');
  }
  if (pilgrim.isPregnant) {
    parts.push('حامل');
  }
  if (pilgrim.hasSpeechDifficulty) {
    parts.push('صعوبة نطق');
  }
  if (Array.isArray(pilgrim.healthConditions) && pilgrim.healthConditions.length > 0) {
    pilgrim.healthConditions
      .filter((c) => c && c !== 'لا يوجد' && c !== 'سليم' && c !== 'لا توجد أمراض')
      .forEach((c) => parts.push(c));
  }
  if (pilgrim.otherHealthCondition && pilgrim.otherHealthCondition.trim()) {
    parts.push(pilgrim.otherHealthCondition.trim());
  }
  if (parts.length === 0) return 'سليم ولله الحمد';
  return Array.from(new Set(parts)).join(' • ');
}

export function isPilgrimNeedsMobilityCare(pilgrim: Pilgrim): boolean {
  const mob = (pilgrim.mobilityIndependence || '').trim();
  if (pilgrim.needsAssistance) return true;
  if (
    mob.includes('كرسي') ||
    mob.includes('مساعدة') ||
    mob.includes('صعوبة') ||
    mob.includes('عكاز') ||
    mob.includes('لا يستطيع')
  ) {
    return true;
  }
  const healthStr = (pilgrim.healthConditions || []).join(' ') + ' ' + (pilgrim.otherHealthCondition || '');
  return healthStr.includes('كرسي') || healthStr.includes('حرك');
}

function normalizeArabicMatchKey(input: string | undefined): string {
  return (input || '')
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ');
}

function normalizePhoneDigits(phone: string | undefined): string {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length >= 9) return digits.slice(-9);
  return digits;
}

/**
 * Detects family & companion clusters using Union-Find across:
 * 1) Explicit mahramDetails (matching nationalId or normalized name)
 * 2) Shared lastName + shared mobile/whatsapp OR shared roomNumberMakkah/Madinah
 */
export function buildFamilyClusters(pilgrims: Pilgrim[]): {
  clusterIdByPilgrimKey: Record<string, string>;
  clustersById: Record<string, Pilgrim[]>;
} {
  const keys = pilgrims.map((p) => p.id || p.nationalId);
  const parent: Record<string, string> = {};
  keys.forEach((k) => {
    parent[k] = k;
  });

  const find = (x: string): string => {
    let root = x;
    while (parent[root] !== root) {
      root = parent[root];
    }
    let cur = x;
    while (parent[cur] !== root) {
      const next = parent[cur];
      parent[cur] = root;
      cur = next;
    }
    return root;
  };

  const union = (a: string, b: string) => {
    if (!a || !b || !(a in parent) || !(b in parent)) return;
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) {
      parent[rb] = ra;
    }
  };

  // Lookup maps for fast O(N) matching
  const byNationalId = new Map<string, string>();
  const byNormalizedName = new Map<string, string[]>();
  const byFamilyAndPhone = new Map<string, string[]>();
  const byFamilyAndRoom = new Map<string, string[]>();

  pilgrims.forEach((p) => {
    const key = p.id || p.nationalId;
    if (!key) return;
    const nid = (p.nationalId || '').replace(/\D/g, '');
    if (nid.length >= 6) {
      byNationalId.set(nid, key);
    }

    const fullName = normalizeArabicMatchKey(getPilgrimDisplayName(p));
    if (fullName) {
      const arr = byNormalizedName.get(fullName) || [];
      arr.push(key);
      byNormalizedName.set(fullName, arr);
    }

    const lastName = normalizeArabicMatchKey(p.lastName);
    if (lastName.length >= 2) {
      const phoneDigits = normalizePhoneDigits(p.mobile || p.whatsapp);
      if (phoneDigits.length >= 9) {
        const fpKey = `${lastName}::${phoneDigits}`;
        const arr = byFamilyAndPhone.get(fpKey) || [];
        arr.push(key);
        byFamilyAndPhone.set(fpKey, arr);
      }
      const room = normalizeArabicMatchKey(p.roomNumberMakkah || p.roomNumberMadinah || p.hotelRoom);
      if (room && room !== 'غير محدد' && room !== '-') {
        const frKey = `${lastName}::${room}`;
        const arr = byFamilyAndRoom.get(frKey) || [];
        arr.push(key);
        byFamilyAndRoom.set(frKey, arr);
      }
    }
  });

  // 1. Link explicit mahramDetails references
  pilgrims.forEach((p) => {
    const key = p.id || p.nationalId;
    if (!key || !Array.isArray(p.mahramDetails)) return;
    p.mahramDetails.forEach((m) => {
      const mNid = (m.nationalId || '').replace(/\D/g, '');
      if (mNid && byNationalId.has(mNid)) {
        union(key, byNationalId.get(mNid)!);
      }
      const mName = normalizeArabicMatchKey(m.name);
      if (mName && mName.length >= 4) {
        const exactMatches = byNormalizedName.get(mName);
        if (exactMatches && exactMatches.length > 0) {
          union(key, exactMatches[0]);
        } else {
          // Soft match when mahram name matches first+second+last or prefix
          for (const [candidateName, candidateKeys] of byNormalizedName.entries()) {
            if (
              candidateKeys.length === 1 &&
              (candidateName.includes(mName) || mName.includes(candidateName)) &&
              Math.min(candidateName.length, mName.length) >= 8
            ) {
              union(key, candidateKeys[0]);
              break;
            }
          }
        }
      }
    });
  });

  // 2. Link shared lastName + shared mobile/whatsapp
  byFamilyAndPhone.forEach((groupKeys) => {
    for (let i = 1; i < groupKeys.length; i++) {
      union(groupKeys[0], groupKeys[i]);
    }
  });

  // 3. Link shared lastName + shared room number
  byFamilyAndRoom.forEach((groupKeys) => {
    for (let i = 1; i < groupKeys.length; i++) {
      union(groupKeys[0], groupKeys[i]);
    }
  });

  const clusterIdByPilgrimKey: Record<string, string> = {};
  const clustersById: Record<string, Pilgrim[]> = {};

  pilgrims.forEach((p) => {
    const key = p.id || p.nationalId;
    if (!key) return;
    const root = find(key);
    clusterIdByPilgrimKey[key] = root;
    if (!clustersById[root]) clustersById[root] = [];
    clustersById[root].push(p);
  });

  return { clusterIdByPilgrimKey, clustersById };
}

/**
 * Computes real-time statistics for every active Mutawwif (isMutawwif === true)
 * plus the complete list of unassigned pilgrims.
 */
export function computeMutawwifOverview(params: {
  guides: ReligiousGuide[];
  activePilgrims: Pilgrim[];
  pilgrimProgressMap: Record<string, PilgrimEducationalProgress>;
}): {
  mutawwifs: ReligiousGuide[];
  statsByMutawwifId: Record<string, MutawwifRealStats>;
  allItems: MutawwifPilgrimItem[];
  unassignedItems: MutawwifPilgrimItem[];
  assignedItems: MutawwifPilgrimItem[];
  clustersById: Record<string, Pilgrim[]>;
} {
  const { guides, activePilgrims, pilgrimProgressMap } = params;
  const mutawwifs = guides.filter((g) => Boolean(g.isMutawwif));
  const mutawwifMap = new Map<string, ReligiousGuide>();
  mutawwifs.forEach((m) => mutawwifMap.set(m.id, m));

  const { clusterIdByPilgrimKey, clustersById } = buildFamilyClusters(activePilgrims);

  const statsByMutawwifId: Record<string, MutawwifRealStats> = {};
  mutawwifs.forEach((m) => {
    statsByMutawwifId[m.id] = {
      mutawwif: m,
      assignedItems: [],
      totalAssigned: 0,
      maleCount: 0,
      femaleCount: 0,
      wheelchairOrAssistCount: 0,
      marjiCounts: {},
    };
  });

  const allItems: MutawwifPilgrimItem[] = [];
  const unassignedItems: MutawwifPilgrimItem[] = [];
  const assignedItems: MutawwifPilgrimItem[] = [];

  activePilgrims.forEach((pilgrim) => {
    const key = pilgrim.id || pilgrim.nationalId;
    if (!key) return;
    const progress =
      pilgrimProgressMap[key] ||
      (pilgrim.nationalId ? pilgrimProgressMap[pilgrim.nationalId] : undefined);
    if (!progress) return;

    const rawMutawwifId = progress.assignedMutawwifId || '';
    const validMutawwif = rawMutawwifId ? mutawwifMap.get(rawMutawwifId) : undefined;
    const clusterId = clusterIdByPilgrimKey[key] || key;
    const clusterSize = clustersById[clusterId]?.length || 1;

    const item: MutawwifPilgrimItem = {
      pilgrim,
      pilgrimKey: key,
      progress,
      assignedMutawwifId: validMutawwif ? validMutawwif.id : '',
      assignedMutawwifName: validMutawwif ? validMutawwif.name : '',
      assignedMutawwifAt: validMutawwif ? progress.assignedMutawwifAt || '' : '',
      familyClusterId: clusterId,
      familyClusterSize: clusterSize,
    };

    allItems.push(item);

    if (validMutawwif) {
      assignedItems.push(item);
      const st = statsByMutawwifId[validMutawwif.id];
      st.assignedItems.push(item);
      st.totalAssigned += 1;
      if (pilgrim.gender === 'أنثى') st.femaleCount += 1;
      else st.maleCount += 1;
      if (isPilgrimNeedsMobilityCare(pilgrim)) st.wheelchairOrAssistCount += 1;
      const marji = getPilgrimEffectiveMarji(pilgrim);
      st.marjiCounts[marji] = (st.marjiCounts[marji] || 0) + 1;
    } else {
      unassignedItems.push(item);
    }
  });

  return {
    mutawwifs,
    statsByMutawwifId,
    allItems,
    unassignedItems,
    assignedItems,
    clustersById,
  };
}

export type AutoDistributeGroupingMode = 'balanced' | 'marji' | 'package_transport';

export interface SmartAutoDistributionPlan {
  assignmentsByPilgrimKey: Record<string, ReligiousGuide>;
  projectedCountsByMutawwifId: Record<string, number>;
  addedCountsByMutawwifId: Record<string, number>;
  totalPilgrimsToDistribute: number;
  familiesPreservedCount: number;
}

/**
 * Computes a balanced, family-aware distribution plan across selected Mutawwifs
 * without mutating state so the supervisor can preview counts before committing.
 */
export function computeSmartAutoDistribution(params: {
  targetMutawwifs: ReligiousGuide[];
  activePilgrims: Pilgrim[];
  pilgrimProgressMap: Record<string, PilgrimEducationalProgress>;
  mode: 'unassigned_only' | 'redistribute_all';
  keepFamiliesTogether: boolean;
  groupingMode: AutoDistributeGroupingMode;
}): SmartAutoDistributionPlan {
  const {
    targetMutawwifs,
    activePilgrims,
    pilgrimProgressMap,
    mode,
    keepFamiliesTogether,
    groupingMode,
  } = params;

  const assignmentsByPilgrimKey: Record<string, ReligiousGuide> = {};
  const projectedCountsByMutawwifId: Record<string, number> = {};
  const addedCountsByMutawwifId: Record<string, number> = {};

  targetMutawwifs.forEach((m) => {
    projectedCountsByMutawwifId[m.id] = 0;
    addedCountsByMutawwifId[m.id] = 0;
  });

  if (targetMutawwifs.length === 0 || activePilgrims.length === 0) {
    return {
      assignmentsByPilgrimKey,
      projectedCountsByMutawwifId,
      addedCountsByMutawwifId,
      totalPilgrimsToDistribute: 0,
      familiesPreservedCount: 0,
    };
  }

  const targetIds = new Set(targetMutawwifs.map((m) => m.id));
  const { clustersById } = buildFamilyClusters(activePilgrims);

  // Seed existing counts when distributing unassigned pilgrims only
  if (mode === 'unassigned_only') {
    activePilgrims.forEach((p) => {
      const key = p.id || p.nationalId;
      const pr = pilgrimProgressMap[key] || (p.nationalId ? pilgrimProgressMap[p.nationalId] : undefined);
      const mid = pr?.assignedMutawwifId || '';
      if (mid && targetIds.has(mid)) {
        projectedCountsByMutawwifId[mid] = (projectedCountsByMutawwifId[mid] || 0) + 1;
      }
    });
  }

  // Filter pilgrims eligible for distribution
  const eligiblePilgrims = activePilgrims.filter((p) => {
    const key = p.id || p.nationalId;
    if (!key) return false;
    if (mode === 'redistribute_all') return true;
    const pr = pilgrimProgressMap[key] || (p.nationalId ? pilgrimProgressMap[p.nationalId] : undefined);
    const mid = pr?.assignedMutawwifId || '';
    return !mid || !targetIds.has(mid);
  });

  if (eligiblePilgrims.length === 0) {
    return {
      assignmentsByPilgrimKey,
      projectedCountsByMutawwifId,
      addedCountsByMutawwifId,
      totalPilgrimsToDistribute: 0,
      familiesPreservedCount: 0,
    };
  }

  const eligibleKeySet = new Set(eligiblePilgrims.map((p) => p.id || p.nationalId));

  // Build atomic units (either family clusters or individual pilgrims)
  interface DistUnit {
    pilgrims: Pilgrim[];
    groupKey: string;
    preferredMutawwifId?: string;
  }

  const units: DistUnit[] = [];
  let familiesPreservedCount = 0;

  if (keepFamiliesTogether) {
    Object.values(clustersById).forEach((clusterMembers) => {
      const eligibleMembers = clusterMembers.filter((p) => eligibleKeySet.has(p.id || p.nationalId));
      if (eligibleMembers.length === 0) return;

      // If another family member is already assigned to one of targetMutawwifs (in unassigned_only mode), keep them together!
      let existingFamilyMutawwifId: string | undefined;
      if (mode === 'unassigned_only') {
        for (const member of clusterMembers) {
          const mKey = member.id || member.nationalId;
          if (!eligibleKeySet.has(mKey)) {
            const pr = pilgrimProgressMap[mKey] || (member.nationalId ? pilgrimProgressMap[member.nationalId] : undefined);
            if (pr?.assignedMutawwifId && targetIds.has(pr.assignedMutawwifId)) {
              existingFamilyMutawwifId = pr.assignedMutawwifId;
              break;
            }
          }
        }
      }

      if (clusterMembers.length > 1) {
        familiesPreservedCount += 1;
      }

      const lead = eligibleMembers[0];
      const groupKey =
        groupingMode === 'marji'
          ? getPilgrimEffectiveMarji(lead)
          : groupingMode === 'package_transport'
          ? `${lead.selectedPackage || lead.packageType || ''} | ${lead.transport || ''}`.trim() || 'عام'
          : 'ALL';

      units.push({
        pilgrims: eligibleMembers,
        groupKey,
        preferredMutawwifId: existingFamilyMutawwifId,
      });
    });
  } else {
    eligiblePilgrims.forEach((p) => {
      const groupKey =
        groupingMode === 'marji'
          ? getPilgrimEffectiveMarji(p)
          : groupingMode === 'package_transport'
          ? `${p.selectedPackage || p.packageType || ''} | ${p.transport || ''}`.trim() || 'عام'
          : 'ALL';
      units.push({
        pilgrims: [p],
        groupKey,
      });
    });
  }

  // First, assign units that already have a family member assigned to a target Mutawwif
  const remainingUnits: DistUnit[] = [];
  const mutawwifById = new Map(targetMutawwifs.map((m) => [m.id, m]));

  units.forEach((unit) => {
    if (unit.preferredMutawwifId && mutawwifById.has(unit.preferredMutawwifId)) {
      const target = mutawwifById.get(unit.preferredMutawwifId)!;
      unit.pilgrims.forEach((p) => {
        assignmentsByPilgrimKey[p.id || p.nationalId] = target;
      });
      projectedCountsByMutawwifId[target.id] += unit.pilgrims.length;
      addedCountsByMutawwifId[target.id] += unit.pilgrims.length;
    } else {
      remainingUnits.push(unit);
    }
  });

  if (groupingMode === 'balanced') {
    // Largest-unit-first load balancing ensures optimal count equality while preserving families
    remainingUnits.sort((a, b) => b.pilgrims.length - a.pilgrims.length);
    remainingUnits.forEach((unit) => {
      let chosen = targetMutawwifs[0];
      let minCount = projectedCountsByMutawwifId[chosen.id] ?? 0;
      for (let i = 1; i < targetMutawwifs.length; i++) {
        const candidate = targetMutawwifs[i];
        const count = projectedCountsByMutawwifId[candidate.id] ?? 0;
        if (count < minCount) {
          minCount = count;
          chosen = candidate;
        }
      }
      unit.pilgrims.forEach((p) => {
        assignmentsByPilgrimKey[p.id || p.nationalId] = chosen;
      });
      projectedCountsByMutawwifId[chosen.id] += unit.pilgrims.length;
      addedCountsByMutawwifId[chosen.id] += unit.pilgrims.length;
    });
  } else {
    // Group-coherent balanced assignment (Marji or Package/Transport)
    // Assign contiguous buckets of the same Marji/Package to the least-loaded Mutawwif up to fair target capacity
    const totalProjectedAll =
      Object.values(projectedCountsByMutawwifId).reduce((a, b) => a + b, 0) +
      remainingUnits.reduce((sum, u) => sum + u.pilgrims.length, 0);
    const idealPerMutawwif = Math.ceil(totalProjectedAll / targetMutawwifs.length);

    // Group units by groupKey and sort buckets largest-first
    const bucketsMap = new Map<string, DistUnit[]>();
    remainingUnits.forEach((u) => {
      const list = bucketsMap.get(u.groupKey) || [];
      list.push(u);
      bucketsMap.set(u.groupKey, list);
    });

    const sortedBuckets = Array.from(bucketsMap.entries()).sort((a, b) => {
      const sizeA = a[1].reduce((s, u) => s + u.pilgrims.length, 0);
      const sizeB = b[1].reduce((s, u) => s + u.pilgrims.length, 0);
      return sizeB - sizeA;
    });

    // Track affinity so members of the same Marji/Package stay with the same Mutawwif until reaching ideal capacity
    sortedBuckets.forEach(([, bucketUnits]) => {
      bucketUnits.sort((a, b) => b.pilgrims.length - a.pilgrims.length);
      let currentTarget: ReligiousGuide | null = null;

      bucketUnits.forEach((unit) => {
        if (
          !currentTarget ||
          projectedCountsByMutawwifId[currentTarget.id] + unit.pilgrims.length > idealPerMutawwif
        ) {
          // Pick least loaded Mutawwif
          let best = targetMutawwifs[0];
          let minLoad = projectedCountsByMutawwifId[best.id] ?? 0;
          for (let i = 1; i < targetMutawwifs.length; i++) {
            const cand = targetMutawwifs[i];
            const load = projectedCountsByMutawwifId[cand.id] ?? 0;
            if (load < minLoad) {
              minLoad = load;
              best = cand;
            }
          }
          currentTarget = best;
        }

        unit.pilgrims.forEach((p) => {
          assignmentsByPilgrimKey[p.id || p.nationalId] = currentTarget!;
        });
        projectedCountsByMutawwifId[currentTarget.id] += unit.pilgrims.length;
        addedCountsByMutawwifId[currentTarget.id] += unit.pilgrims.length;
      });
    });
  }

  return {
    assignmentsByPilgrimKey,
    projectedCountsByMutawwifId,
    addedCountsByMutawwifId,
    totalPilgrimsToDistribute: Object.keys(assignmentsByPilgrimKey).length,
    familiesPreservedCount,
  };
}

/**
 * Commits a mapping of pilgrimKey -> target Mutawwif (or null to unassign)
 * directly to Firestore (`religious_pilgrim_progress` and `religious_guides`) in batch.
 */
export async function applyMutawwifDistributionMap(params: {
  assignmentsByPilgrimKey: Record<string, ReligiousGuide | null>;
  activePilgrims: Pilgrim[];
  pilgrimProgressMap: Record<string, PilgrimEducationalProgress>;
  storedProgressList: PilgrimEducationalProgress[];
  setStoredProgressList: React.Dispatch<React.SetStateAction<PilgrimEducationalProgress[]>>;
  guides: ReligiousGuide[];
  setGuides: React.Dispatch<React.SetStateAction<ReligiousGuide[]>>;
  actorName: string;
  actionNote?: string;
}): Promise<{ updatedCount: number; unassignedCount: number }> {
  const {
    assignmentsByPilgrimKey,
    activePilgrims,
    pilgrimProgressMap,
    storedProgressList,
    setStoredProgressList,
    guides,
    setGuides,
    actorName,
    actionNote,
  } = params;

  const today = new Date().toISOString().split('T')[0];
  const nowStamp = new Date().toLocaleString('ar-SA');

  const progressById = new Map<string, PilgrimEducationalProgress>();
  storedProgressList.forEach((pr) => progressById.set(pr.id, pr));

  const changedProgress: PilgrimEducationalProgress[] = [];
  let updatedCount = 0;
  let unassignedCount = 0;

  activePilgrims.forEach((pilgrim) => {
    const pid = pilgrim.id || pilgrim.nationalId;
    if (!pid || !(pid in assignmentsByPilgrimKey)) return;

    const target = assignmentsByPilgrimKey[pid];
    const basePr =
      pilgrimProgressMap[pid] ||
      (pilgrim.nationalId ? pilgrimProgressMap[pilgrim.nationalId] : undefined);
    if (!basePr) return;

    const nextId = target ? target.id : '';
    const nextName = target ? target.name : '';

    if ((basePr.assignedMutawwifId || '') === nextId) {
      return;
    }

    const prevFollowUp = getDefaultGuideFollowUp(basePr.guideFollowUp);
    const summaryText = target
      ? basePr.assignedMutawwifId
        ? `نقل التطويف من (${basePr.assignedMutawwifName || 'مطوّف سابق'}) إلى المطوّف (${target.name})`
        : `توزيع الحاج على المطوّف (${target.name})${actionNote ? ` — ${actionNote}` : ''}`
      : `إلغاء توزيع الحاج من المطوّف (${basePr.assignedMutawwifName || 'السابق'})`;

    const auditEntry = {
      id: `aud-mut-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: nowStamp,
      authorName: actorName,
      guideId: nextId || basePr.assignedMutawwifId || 'mutawwif',
      guideName: nextName || basePr.assignedMutawwifName || 'إدارة المطوّفين',
      actionSummary: summaryText,
    };

    const updatedPr: PilgrimEducationalProgress = {
      ...basePr,
      assignedMutawwifId: nextId,
      assignedMutawwifName: nextName,
      assignedMutawwifAt: target ? today : '',
      guideFollowUp: {
        ...prevFollowUp,
        lastUpdatedAt: today,
        updatedBy: actorName,
        historyLog: [auditEntry, ...prevFollowUp.historyLog],
      },
      lastUpdated: today,
    };

    progressById.set(updatedPr.id, updatedPr);
    changedProgress.push(updatedPr);

    if (target) updatedCount += 1;
    else unassignedCount += 1;
  });

  if (changedProgress.length === 0) {
    return { updatedCount: 0, unassignedCount: 0 };
  }

  const nextProgressList = Array.from(progressById.values());
  setStoredProgressList(nextProgressList);
  writeLocal(STORAGE_KEYS.progress, nextProgressList);
  await Promise.all(
    changedProgress.map((pr) => setDocument('religious_pilgrim_progress', pr.id, pr))
  );

  // Sync assignedMutawwifPilgrimIds on all guides
  const nextMap: Record<string, PilgrimEducationalProgress> = { ...pilgrimProgressMap };
  changedProgress.forEach((pr) => {
    nextMap[pr.pilgrimId] = pr;
    if (pr.nationalId) nextMap[pr.nationalId] = pr;
  });

  const nextGuides = guides.map((g) => {
    const assignedMutawwifPilgrimIds = activePilgrims
      .filter((p) => {
        const key = p.id || p.nationalId;
        const pr = nextMap[key] || (p.nationalId ? nextMap[p.nationalId] : undefined);
        return pr?.assignedMutawwifId === g.id;
      })
      .map((p) => p.id || p.nationalId);

    return {
      ...g,
      assignedMutawwifPilgrimIds,
      updatedAt: today,
    };
  });

  setGuides(nextGuides);
  writeLocal(STORAGE_KEYS.guides, nextGuides);
  await Promise.all(nextGuides.map((g) => setDocument('religious_guides', g.id, g)));

  return { updatedCount, unassignedCount };
}

export { STORAGE_KEYS };
