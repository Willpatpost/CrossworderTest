/**
 * Internal shared shape contracts for Crossworder.
 *
 * These typedefs are intentionally framework-free and runtime-light so the
 * codebase can stay in plain JavaScript while still documenting the app's
 * state model and shared puzzle contracts.
 */

export {};

/**
 * @typedef {'' | '#' | string} GridCell
 */

/**
 * @typedef {GridCell[][]} GridMatrix
 */

/**
 * @typedef {{
 *   id: string,
 *   direction: 'across' | 'down',
 *   number: number,
 *   positions: Array<[number, number]>,
 *   length: number
 * }} Slot
 */

/**
 * @typedef {Record<string, Slot>} SlotMap
 */

/**
 * @typedef {{
 *   title?: string,
 *   author?: string,
 *   difficulty?: string,
 *   tags?: string,
 *   copyright?: string,
 *   sourceUrl?: string,
 *   notes?: string
 * }} PuzzleMetadata
 */

/**
 * @typedef {{
 *   kind?: string,
 *   id?: string,
 *   label?: string,
 *   author?: string,
 *   date?: string
 * }} PuzzleSource
 */

/**
 * @typedef {{
 *   savedAt: string,
 *   source: PuzzleSource | null,
 *   editorGrid: GridMatrix,
 *   playGrid: GridMatrix | null,
 *   currentPuzzleClues: Record<string, string>,
 *   currentPuzzleMetadata: PuzzleMetadata,
 *   currentSolution: Record<string, string> | null,
 *   slotBlacklist: Record<string, string[]>,
 *   playState: {
 *     elapsedMs: number,
 *     hasCompleted: boolean
 *   }
 * }} RecentPuzzleRecord
 */

/**
 * @typedef {{
 *   id: string,
 *   sourceId: string,
 *   title: string,
 *   author: string,
 *   timeLabel: string,
 *   completedAt: string,
 *   difficulty: string,
 *   sourceKind: string
 * }} CompletedPuzzleEntry
 */

/**
 * @typedef {{
 *   grid: GridMatrix,
 *   slots: SlotMap,
 *   wordLengthCache: Record<string, string[]>,
 *   letterFrequencies: Record<string, number>,
 *   currentSolution: Record<string, string> | null,
 *   editorGridSnapshot: GridMatrix | null,
 *   currentPuzzleClues: Record<string, string>,
 *   currentPuzzleMetadata: PuzzleMetadata,
 *   activePuzzleSource: PuzzleSource | null,
 *   slotBlacklist: Record<string, string[]>
 * }} WorkspaceState
 */

/**
 * @typedef {{
 *   isDragging: boolean,
 *   dragPaintValue: string,
 *   history: Array<Record<string, unknown>>,
 *   future: Array<Record<string, unknown>>
 * }} EditorState
 */

/**
 * @typedef {{
 *   isSolving: boolean,
 *   activeWorker: Worker | null,
 *   activeSession: {
 *     settled: boolean,
 *     reject: (error: Error) => void
 *   } | null,
 *   solveRunId: number
 * }} SolverState
 */

/**
 * @typedef {{
 *   puzzleIndex: Array<Record<string, unknown>>,
 *   missingPuzzleFiles: Set<string>,
 *   puzzleOfTheDay: Record<string, unknown> | null
 * }} LibraryState
 */

/**
 * @typedef {{
 *   isPaused: boolean,
 *   elapsedMs: number,
 *   timerStartedAt: number | null,
 *   timerInterval: number | null,
 *   hasCompletedPuzzle: boolean,
 *   isInstantMistakeMode: boolean
 * }} PlayState
 */
