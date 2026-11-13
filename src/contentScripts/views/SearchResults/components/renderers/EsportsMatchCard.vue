<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

interface Team {
  ID: number
  title: string
  logo: string
  logoFull: string
}

interface Contest {
  ID: number
  gameStage: string
  stime: number
  homeTeam: Team
  awayTeam: Team
  homeScore?: number
  awayScore?: number
  season: {
    title: string
  }
  playback?: string
  jumpURL?: string
  contestStatus: number // 1: 未开始, 2: 进行中, 3: 已结束
}

const props = defineProps<{
  contest: Contest
  cardWidth?: string
}>()

const { t } = useI18n()

const matchUrl = computed(() => {
  return props.contest.playback || props.contest.jumpURL || ''
})

const cardStyle = computed(() => {
  return {
    width: props.cardWidth || '250px',
    minWidth: props.cardWidth || '250px',
  }
})

// 判断比赛是否已结束
const isFinished = computed(() => {
  return props.contest.contestStatus === 3
})

// 判断比赛是否未开始
const isNotStarted = computed(() => {
  return props.contest.contestStatus === 1
})

// 格式化比赛时间
const matchTime = computed(() => {
  if (!props.contest.stime)
    return ''
  const date = new Date(props.contest.stime * 1000)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${month}-${day} ${hours}:${minutes}`
})

// 获取主队比分（如果没有则默认为0）
const homeScore = computed(() => {
  if (props.contest.homeScore !== undefined && props.contest.homeScore !== null) {
    return props.contest.homeScore
  }
  // 如果比赛已结束或进行中，没有比分则显示0
  return !isNotStarted.value ? 0 : null
})

// 获取客队比分（如果没有则默认为0）
const awayScore = computed(() => {
  if (props.contest.awayScore !== undefined && props.contest.awayScore !== null) {
    return props.contest.awayScore
  }
  // 如果比赛已结束或进行中，没有比分则显示0
  return !isNotStarted.value ? 0 : null
})
</script>

<template>
  <a
    :href="matchUrl"
    target="_blank"
    class="esports-match-card"
    :style="cardStyle"
    rounded="$bew-surface-radius"
    block
    cursor="pointer"
    @click.stop=""
  >
    <div class="card-content">
      <!-- 赛事标题和状态 -->
      <div class="header-container">
        <div class="season-title keep-one-line">
          {{ contest.season.title }}
        </div>
        <!-- 状态标签 -->
        <div text="sm" class="status-badge" :class="{ finished: isFinished, live: !isNotStarted && !isFinished, upcoming: isNotStarted }">
          <template v-if="isFinished">{{ t('search.esports.finished') }}</template>
          <template v-else-if="isNotStarted">{{ t('search.esports.not_started') }}</template>
          <template v-else>{{ t('search.esports.in_progress') }}</template>
        </div>
      </div>

      <!-- 比赛阶段和时间 -->
      <div text="xs" class="match-info">
        <span class="game-stage-inline">{{ contest.gameStage }}</span>
        <span v-if="isNotStarted" class="match-time">{{ matchTime }}</span>
      </div>

      <!-- 队伍信息 -->
      <div class="teams-container">
        <!-- 主队 -->
        <div class="team">
          <img
            :src="contest.homeTeam.logoFull"
            :alt="contest.homeTeam.title"
            class="team-logo"
          >
          <div text="sm" class="team-name keep-one-line">
            {{ contest.homeTeam.title }}
          </div>
        </div>

        <!-- 比分或VS -->
        <div class="score-container">
          <template v-if="isNotStarted">
            <span class="vs-text">VS</span>
          </template>
          <template v-else>
            <span class="score">{{ homeScore }}</span>
            <span class="score-divider">:</span>
            <span class="score">{{ awayScore }}</span>
          </template>
        </div>

        <!-- 客队 -->
        <div class="team">
          <img
            :src="contest.awayTeam.logoFull"
            :alt="contest.awayTeam.title"
            class="team-logo"
          >
          <div text="sm" class="team-name keep-one-line">
            {{ contest.awayTeam.title }}
          </div>
        </div>
      </div>

    </div>
  </a>
</template>

<style scoped lang="scss">
@use "../../../../../styles/contentCard";

// The search result card surface (mediaResults.scss), lifted like other surface cards.
.esports-match-card {
  box-sizing: border-box;
  background: var(--bew-content-solid);
  border: var(--bew-hairline) solid var(--bew-edge-color);
  corner-shape: var(--bew-corner-shape);
  aspect-ratio: 5 / 3;
  overflow: hidden;
  @include contentCard.surface($press: false);
}

.card-content {
  height: 100%;
  padding: var(--bew-space-3);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.header-container {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--bew-space-2);
  margin-bottom: var(--bew-space-2);
}

.season-title {
  font-size: var(--bew-font-size-title);
  font-weight: var(--bew-font-weight-regular);
  line-height: var(--bew-line-height-title);
  color: var(--bew-text-1);
  flex: 1;
  min-width: 0;
}

.status-badge {
  padding: var(--bew-space-0-5) var(--bew-space-2);
  border-radius: var(--bew-radius-tiny);
  corner-shape: var(--bew-corner-shape);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-regular);
  line-height: var(--bew-line-height-control);
  white-space: nowrap;
  flex-shrink: 0;

  &.finished {
    background: var(--bew-fill-2);
    color: var(--bew-text-3);
  }

  &.live {
    background: var(--bew-error-color-10);
    color: var(--bew-error-foreground);
  }

  &.upcoming {
    background: var(--bew-pressed-bg);
    color: var(--bew-text-1);
  }
}

.match-info {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--bew-space-2);
  margin-bottom: var(--bew-space-2);
  color: var(--bew-text-3);
}

.game-stage-inline {
  color: var(--bew-text-3);
}

.match-time {
  color: var(--bew-text-3);
}

.teams-container {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--bew-space-4);
  flex: 1;
}

.team {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 28%;
  min-width: 0;
}

.team-logo {
  width: 100%;
  max-width: calc(var(--bew-space-8) * 2);
  aspect-ratio: 1;
  border-radius: var(--bew-thumb-radius);
  corner-shape: var(--bew-corner-shape);
  object-fit: cover;
  // 6px: half-way between the 4px and 8px steps, under a logo.
  margin-bottom: calc(var(--bew-space-1) + var(--bew-space-0-5));
}

.team-name {
  color: var(--bew-text-1);
  text-align: center;
  width: 100%;
}

.score-container {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--bew-space-2);
  flex-shrink: 0;
  min-width: calc(var(--bew-space-10) * 2);
}

.score {
  font-family: var(--bew-fonts-monospace);
  font-variant-numeric: tabular-nums;
  font-size: var(--bew-font-size-data-emphasis);
  font-weight: var(--bew-font-weight-regular);
  color: var(--bew-text-1);
  line-height: var(--bew-line-height-data);
  min-width: var(--bew-space-6);
  text-align: center;
}

.score-divider {
  font-size: var(--bew-font-size-heading);
  color: var(--bew-text-3);
  line-height: 1;
}

.vs-text {
  font-size: var(--bew-font-size-data);
  font-weight: var(--bew-font-weight-regular);
  color: var(--bew-text-2);
  line-height: var(--bew-line-height-data);
}

.game-stage {
  font-size: var(--bew-font-size-control);
  color: var(--bew-text-3);
  padding: var(--bew-space-1) var(--bew-space-2);
  background: var(--bew-fill-2);
  border-radius: var(--bew-pill-radius);
  corner-shape: var(--bew-corner-shape-capsule);
  text-align: center;
}
</style>
