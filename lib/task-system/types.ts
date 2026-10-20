import type { LevelId } from '@/lib/business-areas'
import type { TaskColumn, ColumnKind } from './columns'

export type Priority = 'urgent' | 'high' | 'medium' | 'low'
export type Status = 'todo' | 'in_progress' | 'done'

export interface BoardTask {
  id: string
  title: string
  description: string
  status: Status
  priority: Priority
  assignee: string
  dueDate: string
  createdAt: string

  accountId?: string

  area?: LevelId

  fields?: Record<string, string>

  relatedAccountId?: string

  parentId?: string
  projectId?: string
  owner?: 'me' | 'team' | 'client'

  sortOrder?: number
}

export interface BoardGroup {
  id: string
  name: string
}

export interface BoardProps {
  tasks: BoardTask[]

  accounts: BoardGroup[]

  team?: string[]
  onEditTask: (t: BoardTask) => void
  onSetStatus: (t: BoardTask, status: Status) => void

  onPatchTask?: (t: BoardTask, patch: Partial<BoardTask>) => void

  onReorder?: (orderedIds: string[], movedId: string, extra?: Partial<BoardTask>) => void
  onAddTask: (preset?: { accountId?: string; parentId?: string; projectId?: string; area?: LevelId; dueDate?: string; status?: Status }) => void

  columns?: TaskColumn[]

  onAddColumn?: (name: string, kind: ColumnKind) => void
  onRemoveColumn?: (id: string) => void

  onQuickAdd?: (title: string, preset: { accountId?: string; parentId?: string; area?: LevelId; status?: Status; objectiveId?: string }) => void

  onDeleteTask?: (t: BoardTask) => void

  readOnly?: boolean
}
