import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Modal, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  challengeSummary,
  difficultyLabel,
  generateWeeklyPlan,
  kindLabel,
  stepLabel,
} from '../domain/rotation';
import { weekdayLong } from '../domain/schedule';
import type { Challenge, ChallengeKind, ChallengePlan, ChallengeStep, Difficulty, IsoWeekday, RotationMode } from '../domain/types';
import { useApp } from '../state/AppProvider';
import {
  Button,
  Card,
  Chip,
  Divider,
  IconButton,
  ListRow,
  Row,
  Segmented,
  Stepper,
  Text,
  type IconName,
} from '../ui/components';
import { space, useTheme } from '../ui/theme';

export const KIND_ICON: Record<ChallengeKind, IconName> = {
  none: 'hand-left-outline',
  math: 'calculator-outline',
  steps: 'walk-outline',
  qr: 'qr-code-outline',
  photo: 'camera-outline',
};

const DIFFS: { value: Difficulty; label: string }[] = [
  { value: 'easy', label: difficultyLabel('easy') },
  { value: 'medium', label: difficultyLabel('medium') },
  { value: 'hard', label: difficultyLabel('hard') },
];

function defaultStep(kind: ChallengeKind, qrId?: string, photoId?: string): ChallengeStep {
  switch (kind) {
    case 'none':
      return { kind: 'none' };
    case 'math':
      return { kind: 'math', count: 3, difficulty: 'medium' };
    case 'steps':
      return { kind: 'steps', steps: 50 };
    case 'qr':
      return { kind: 'qr', qrTargetId: qrId ?? '' };
    case 'photo':
      return { kind: 'photo', photoTargetId: photoId ?? '', strictness: 'medium' };
  }
}

/** Validation shared by the editor's Save button. */
export function challengeProblems(c: Challenge, qrIds: Set<string>, photoIds: Set<string>): string[] {
  const out: string[] = [];
  for (const s of c.steps) {
    if (s.kind === 'qr' && !qrIds.has(s.qrTargetId)) out.push('Vyber QR kód, který budeš ráno skenovat.');
    if (s.kind === 'photo' && !photoIds.has(s.photoTargetId)) out.push('Vyber předmět, který budeš ráno fotit.');
  }
  if (c.steps.length === 0) out.push('Přidej alespoň jeden úkol.');
  return out;
}

export function planProblems(p: ChallengePlan, qrIds: Set<string>, photoIds: Set<string>): string[] {
  const list: Challenge[] =
    p.mode === 'fixed' ? [p.challenge] : p.mode === 'weekday'
      ? [...(Object.values(p.weekdayPlan).filter(Boolean) as Challenge[]), ...(Object.keys(p.weekdayPlan).length < 7 ? [p.challenge] : [])]
      : p.pool;
  if (p.mode !== 'fixed' && p.mode !== 'weekday' && p.pool.length < 2) return ['Rotace potřebuje alespoň 2 úkoly.'];
  if (p.mode === 'weekday' && list.length === 0) return ['Týdenní plán je prázdný — vytvoř ho automaticky nebo nastav dny.'];
  return [...new Set(list.flatMap((c) => challengeProblems(c, qrIds, photoIds)))];
}

/** Edits one challenge = an ordered list of steps (combined mode when >1). */
export function ChallengeBuilder({ value, onChange }: { value: Challenge; onChange: (c: Challenge) => void }) {
  const t = useTheme();
  const { qrTargets, photoTargets } = useApp();
  const setStep = (i: number, s: ChallengeStep) => onChange({ steps: value.steps.map((x, j) => (j === i ? s : x)) });
  const remove = (i: number) => onChange({ steps: value.steps.filter((_, j) => j !== i) });
  const moveUp = (i: number) => {
    if (i === 0) return;
    const s = [...value.steps];
    [s[i - 1], s[i]] = [s[i], s[i - 1]];
    onChange({ steps: s });
  };
  const add = (kind: ChallengeKind) => {
    const step = defaultStep(kind, qrTargets[0]?.id, photoTargets[0]?.id);
    if (kind === 'none') onChange({ steps: [step] });
    else onChange({ steps: [...value.steps.filter((s) => s.kind !== 'none'), step] });
  };

  return (
    <View style={{ gap: space.md }}>
      {value.steps.map((s, i) => (
        <Card key={i} tone="alt" style={{ gap: space.md }}>
          <Row>
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: 11,
                backgroundColor: t.primarySoft,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name={KIND_ICON[s.kind]} size={18} color={t.primary} />
            </View>
            <Text variant="bodyStrong" style={{ flex: 1 }}>
              {value.steps.length > 1 ? `${i + 1}. ` : ''}
              {kindLabel(s.kind)}
            </Text>
            {i > 0 && <IconButton icon="arrow-up" size={32} label="Posunout výš" onPress={() => moveUp(i)} />}
            {value.steps.length > 1 && <IconButton icon="close" size={32} label="Odebrat úkol" onPress={() => remove(i)} />}
          </Row>

          {s.kind === 'none' && (
            <Text variant="caption" muted>
              Budík vypneš podržením tlačítka. Bez úkolu je snadné znovu usnout.
            </Text>
          )}
          {s.kind === 'math' && (
            <>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text muted>Počet příkladů</Text>
                <Stepper label="Počet příkladů" value={s.count} min={1} max={10} onChange={(count) => setStep(i, { ...s, count })} />
              </Row>
              <Segmented options={DIFFS} value={s.difficulty} onChange={(difficulty) => setStep(i, { ...s, difficulty })} />
            </>
          )}
          {s.kind === 'steps' && (
            <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
              {[20, 30, 50, 100, 200].map((n) => (
                <Chip key={n} label={`${n} kroků`} selected={s.steps === n} onPress={() => setStep(i, { ...s, steps: n })} />
              ))}
            </Row>
          )}
          {s.kind === 'qr' && (
            <>
              <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
                {qrTargets.map((q) => (
                  <Chip key={q.id} icon="qr-code-outline" label={q.name} selected={s.qrTargetId === q.id} onPress={() => setStep(i, { ...s, qrTargetId: q.id })} />
                ))}
                <Chip icon="add" label="Nový QR kód" onPress={() => router.push('/targets/qr')} />
              </Row>
              {qrTargets.length === 0 && (
                <Text variant="caption" muted>
                  Vytvoř si QR kód, vytiskni ho a nalep třeba do koupelny. Ráno k němu budeš muset dojít.
                </Text>
              )}
            </>
          )}
          {s.kind === 'photo' && (
            <>
              <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
                {photoTargets.map((p) => (
                  <Chip key={p.id} icon="image-outline" label={p.name} selected={s.photoTargetId === p.id} onPress={() => setStep(i, { ...s, photoTargetId: p.id })} />
                ))}
                <Chip icon="add" label="Nový předmět" onPress={() => router.push('/targets/photo')} />
              </Row>
              <Text variant="caption" muted>
                Přísnost porovnání
              </Text>
              <Segmented options={DIFFS} value={s.strictness} onChange={(strictness) => setStep(i, { ...s, strictness })} />
            </>
          )}
        </Card>
      ))}

      <Text variant="caption" muted>
        {value.steps.length > 0 && value.steps[0].kind !== 'none' ? 'Přidat další úkol (kombinovaný režim)' : 'Vyber úkol'}
      </Text>
      <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
        {(['photo', 'math', 'steps', 'qr', 'none'] as ChallengeKind[]).map((k) => (
          <Chip key={k} icon={KIND_ICON[k]} label={kindLabel(k)} onPress={() => add(k)} />
        ))}
      </Row>
    </View>
  );
}

function Sheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose} transparent={false}>
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <Row style={{ justifyContent: 'space-between', padding: space.lg, paddingTop: space.lg + (insets.top > 30 ? 0 : insets.top) }}>
          <Text variant="heading">{title}</Text>
          <Button title="Hotovo" size="md" kind="secondary" onPress={onClose} />
        </Row>
        <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: insets.bottom + 40, gap: space.md }}>{children}</ScrollView>
      </View>
    </Modal>
  );
}

const MODES: { value: 'fixed' | 'weekday' | 'rotation'; label: string }[] = [
  { value: 'fixed', label: 'Stejný' },
  { value: 'weekday', label: 'Týdenní plán' },
  { value: 'rotation', label: 'Střídání' },
];

const ROTATIONS: { value: Exclude<RotationMode, 'fixed' | 'weekday'>; label: string }[] = [
  { value: 'daily', label: 'Každý den' },
  { value: 'weekly', label: 'Každý týden' },
  { value: 'random', label: 'Náhodně' },
];

const DAYS: IsoWeekday[] = [1, 2, 3, 4, 5, 6, 7];

/** Full plan editor: fixed task, per-weekday plan, or rotation pool. */
export function ChallengePlanEditor({ value, onChange }: { value: ChallengePlan; onChange: (p: ChallengePlan) => void }) {
  const { qrTargets, photoTargets } = useApp();
  const [editing, setEditing] = useState<{ kind: 'day'; day: IsoWeekday } | { kind: 'pool'; index: number } | null>(null);
  const group = value.mode === 'fixed' ? 'fixed' : value.mode === 'weekday' ? 'weekday' : 'rotation';

  const autoPlan = () =>
    onChange({
      ...value,
      mode: 'weekday',
      weekdayPlan: generateWeeklyPlan({
        photoTargetIds: photoTargets.map((p) => p.id),
        qrTargetIds: qrTargets.map((q) => q.id),
        stepsAvailable: true,
      }),
    });

  const editingChallenge: Challenge | null =
    editing?.kind === 'day'
      ? value.weekdayPlan[editing.day] ?? value.challenge
      : editing?.kind === 'pool'
        ? value.pool[editing.index] ?? null
        : null;

  return (
    <View style={{ gap: space.md }}>
      <Segmented
        options={MODES}
        value={group}
        onChange={(g) => {
          if (g === 'fixed') onChange({ ...value, mode: 'fixed' });
          if (g === 'weekday') {
            if (Object.keys(value.weekdayPlan).length === 0) autoPlan();
            else onChange({ ...value, mode: 'weekday' });
          }
          if (g === 'rotation') {
            const pool = value.pool.length >= 2 ? value.pool : [value.challenge, { steps: [{ kind: 'steps' as const, steps: 50 }] }];
            onChange({ ...value, mode: 'daily', pool });
          }
        }}
      />

      {value.mode === 'fixed' && <ChallengeBuilder value={value.challenge} onChange={(challenge) => onChange({ ...value, challenge })} />}

      {value.mode === 'weekday' && (
        <Card style={{ paddingVertical: space.sm }}>
          {DAYS.map((d, i) => {
            const c = value.weekdayPlan[d];
            return (
              <View key={d}>
                {i > 0 && <Divider />}
                <ListRow
                  icon={c ? KIND_ICON[c.steps[0]?.kind ?? 'none'] : 'remove-outline'}
                  title={weekdayLong(d)}
                  subtitle={c ? challengeSummary(c) : `Výchozí: ${challengeSummary(value.challenge)}`}
                  onPress={() => setEditing({ kind: 'day', day: d })}
                />
              </View>
            );
          })}
          <Divider />
          <Button title="Vytvořit plán automaticky" kind="ghost" icon="sparkles-outline" onPress={autoPlan} />
        </Card>
      )}

      {group === 'rotation' && (
        <>
          <Segmented
            options={ROTATIONS}
            value={value.mode as Exclude<RotationMode, 'fixed' | 'weekday'>}
            onChange={(mode) => onChange({ ...value, mode })}
          />
          <Text variant="caption" muted>
            {value.mode === 'daily'
              ? 'Úkoly se střídají den po dni.'
              : value.mode === 'weekly'
                ? 'Celý týden stejný úkol, každé pondělí další.'
                : 'Při každém zazvonění náhodně jeden z úkolů.'}
          </Text>
          <Card style={{ paddingVertical: space.sm }}>
            {value.pool.map((c, i) => (
              <View key={i}>
                {i > 0 && <Divider />}
                <ListRow
                  icon={KIND_ICON[c.steps[0]?.kind ?? 'none']}
                  title={`Úkol ${i + 1}`}
                  subtitle={challengeSummary(c)}
                  onPress={() => setEditing({ kind: 'pool', index: i })}
                  right={
                    value.pool.length > 2 ? (
                      <IconButton
                        icon="trash-outline"
                        tone="plain"
                        size={34}
                        label={`Odebrat úkol ${i + 1}`}
                        onPress={() => onChange({ ...value, pool: value.pool.filter((_, j) => j !== i) })}
                      />
                    ) : undefined
                  }
                />
              </View>
            ))}
            <Divider />
            <Button
              title="Přidat úkol"
              kind="ghost"
              icon="add"
              onPress={() => {
                onChange({ ...value, pool: [...value.pool, { steps: [{ kind: 'math', count: 3, difficulty: 'medium' }] }] });
                setEditing({ kind: 'pool', index: value.pool.length });
              }}
            />
          </Card>
        </>
      )}

      <Sheet
        visible={editing != null && editingChallenge != null}
        title={editing?.kind === 'day' ? weekdayLong(editing.day) : editing ? `Úkol ${editing.index + 1}` : ''}
        onClose={() => setEditing(null)}
      >
        {editing && editingChallenge && (
          <ChallengeBuilder
            value={editingChallenge}
            onChange={(c) => {
              if (editing.kind === 'day') onChange({ ...value, weekdayPlan: { ...value.weekdayPlan, [editing.day]: c } });
              else onChange({ ...value, pool: value.pool.map((x, j) => (j === editing.index ? c : x)) });
            }}
          />
        )}
        {editing?.kind === 'day' && value.weekdayPlan[editing.day] && (
          <Button
            title="Použít výchozí úkol"
            kind="secondary"
            onPress={() => {
              const next = { ...value.weekdayPlan };
              delete next[editing.day];
              onChange({ ...value, weekdayPlan: next });
              setEditing(null);
            }}
          />
        )}
      </Sheet>
    </View>
  );
}

export function StepSummaryChips({ challenge }: { challenge: Challenge }) {
  return (
    <Row gap={6} style={{ flexWrap: 'wrap' }}>
      {challenge.steps.map((s, i) => (
        <Chip key={i} icon={KIND_ICON[s.kind]} label={stepLabel(s)} />
      ))}
    </Row>
  );
}

