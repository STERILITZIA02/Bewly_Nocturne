<script setup lang="ts">
import { onClickOutside } from '@vueuse/core'
import { computed, inject, nextTick, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { useAnchoredPopoverPosition } from '~/composables/useAnchoredPopoverPosition'
import type { BewlyAppProvider } from '~/composables/useAppProvider'

import { formatLocalCalendarDate, parseLocalCalendarDate, toLocalDate } from '../utils/localDate'

const props = withDefaults(defineProps<{
  modelValue?: string
  min?: string
  max?: string
  placeholder?: string
  label?: string
  embedded?: boolean
  teleport?: boolean
  disabled?: boolean
  active?: boolean
  invalid?: boolean
}>(), { active: true })

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()
const { t } = useI18n()

const showPicker = ref(false)
const keyboardOpened = ref(false)
const pickerRef = ref<HTMLElement>()
const panelRef = ref<HTMLElement>()
const triggerRef = ref<HTMLButtonElement>()
const app = inject<BewlyAppProvider | undefined>('BEWLY_APP', undefined)
const teleportTarget = computed(() => {
  if (!props.teleport)
    return undefined
  const root = pickerRef.value?.getRootNode()
  return app?.mainAppRef.value ?? (root?.nodeType === 11 ? root as ShadowRoot : pickerRef.value?.ownerDocument.body)
})
const pickerLabel = computed(() => props.label || props.placeholder || t('search.date_picker.start_date'))
const focusedDay = ref('')
useAnchoredPopoverPosition(pickerRef, panelRef, showPicker)
const pickerId = useId()
const inputValue = ref('')
const isInputMode = ref(false)

// 当前显示的年月
const currentYear = ref(new Date().getFullYear())
const currentMonth = ref(new Date().getMonth())
const minDate = computed(() => props.min ? parseLocalCalendarDate(props.min) : null)

// 解析 max 日期
const maxDate = computed(() => {
  if (!props.max)
    return null
  return parseLocalCalendarDate(props.max)
})

// 格式化显示的日期
const displayValue = computed(() => {
  if (!props.modelValue)
    return ''
  return props.modelValue.replace(/-/g, '/')
})

// 同步 modelValue 到 inputValue
watch(() => props.modelValue, (newVal) => {
  if (!isInputMode.value) {
    inputValue.value = newVal ? displayValue.value : ''
  }
  closePicker()
}, { immediate: true })
watch(() => [props.active, props.disabled], () => {
  if (!props.active || props.disabled)
    closePicker()
})

// 解析用户输入的日期
// 生成日历数据
const calendarDays = computed(() => {
  const year = currentYear.value
  const month = currentMonth.value

  // 当月第一天
  const firstDay = new Date(year, month, 1)
  const firstDayWeek = firstDay.getDay()

  // 当月天数
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  // 上个月的天数
  const prevMonthDays = new Date(year, month, 0).getDate()

  const days: Array<{
    day: number
    month: 'prev' | 'current' | 'next'
    date: Date
    disabled: boolean
    isToday: boolean
    isSelected: boolean
  }> = []

  // 填充上个月的日期
  for (let i = firstDayWeek - 1; i >= 0; i--) {
    const day = prevMonthDays - i
    const date = new Date(year, month - 1, day)
    days.push({
      day,
      month: 'prev',
      date,
      disabled: isDateDisabled(date),
      isToday: false,
      isSelected: false,
    })
  }

  // 填充当月的日期
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day)
    const isToday = isSameDay(date, new Date())
    const selectedDate = props.modelValue ? parseLocalCalendarDate(props.modelValue) : null
    const isSelected = selectedDate ? isSameDay(date, toLocalDate(selectedDate)) : false

    days.push({
      day,
      month: 'current',
      date,
      disabled: isDateDisabled(date),
      isToday,
      isSelected,
    })
  }

  // 填充下个月的日期，补齐到 42 个（6 行 x 7 列）
  const remainingDays = 42 - days.length
  for (let day = 1; day <= remainingDays; day++) {
    const date = new Date(year, month + 1, day)
    days.push({
      day,
      month: 'next',
      date,
      disabled: isDateDisabled(date),
      isToday: false,
      isSelected: false,
    })
  }

  return days
})

// 检查日期是否被禁用
function isDateDisabled(date: Date): boolean {
  if (props.disabled || !props.active)
    return true
  const checkDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  return Boolean((minDate.value && checkDate < toLocalDate(minDate.value)) || (maxDate.value && checkDate > toLocalDate(maxDate.value)))
}

// 检查是否是同一天
function isSameDay(date1: Date, date2: Date): boolean {
  return date1.getFullYear() === date2.getFullYear()
    && date1.getMonth() === date2.getMonth()
    && date1.getDate() === date2.getDate()
}

// 格式化日期为 YYYY-MM-DD
function formatDate(date: Date): string {
  return formatLocalCalendarDate({
    year: date.getFullYear(),
    month: date.getMonth(),
    day: date.getDate(),
  })
}

// 选择日期
function selectDate(day: typeof calendarDays.value[0]) {
  if (day.disabled || !showPicker.value || isDateDisabled(day.date))
    return

  const date = day.date
  emit('update:modelValue', formatDate(date))
  closePicker(true)
}

// 上个月
function prevMonth() {
  if (currentMonth.value === 0) {
    currentMonth.value = 11
    currentYear.value--
  }
  else {
    currentMonth.value--
  }
}

// 下个月
function nextMonth() {
  if (currentMonth.value === 11) {
    currentMonth.value = 0
    currentYear.value++
  }
  else {
    currentMonth.value++
  }
}

// 上一年
function prevYear() {
  currentYear.value--
}

// 下一年
function nextYear() {
  currentYear.value++
}

// 今天
function selectToday() {
  const today = new Date()
  if (!isDateDisabled(today)) {
    emit('update:modelValue', formatDate(today))
    closePicker(true)
  }
}

// 清除
function clearDate() {
  if (props.disabled || !props.active)
    return
  emit('update:modelValue', '')
  closePicker(true)
  inputValue.value = ''
}

function closePicker(restoreFocus = false) {
  showPicker.value = false
  if (restoreFocus)
    void nextTick(() => triggerRef.value?.focus({ preventScroll: true }))
}

function handlePickerKeydown(event: KeyboardEvent) {
  if (event.isComposing || event.key !== 'Escape' || !showPicker.value)
    return
  event.preventDefault()
  event.stopPropagation()
  keyboardOpened.value = true
  closePicker(true)
}

function handlePickerFocusOut(event: FocusEvent) {
  const next = event.relatedTarget as Node | null
  if (!pickerRef.value?.contains(next) && !panelRef.value?.contains(next))
    closePicker()
}

// 打开选择器时，初始化到当前选中的日期或今天
function openPicker(event?: MouseEvent) {
  if (props.disabled || !props.active)
    return
  keyboardOpened.value = event?.detail === 0
  const selected = props.modelValue ? parseLocalCalendarDate(props.modelValue) : null
  let openingDate = selected ? toLocalDate(selected) : new Date()
  if (minDate.value && openingDate < toLocalDate(minDate.value))
    openingDate = toLocalDate(minDate.value)
  if (maxDate.value && openingDate > toLocalDate(maxDate.value))
    openingDate = toLocalDate(maxDate.value)
  currentYear.value = openingDate.getFullYear()
  currentMonth.value = openingDate.getMonth()
  showPicker.value = true
  const preferred = calendarDays.value.find(day => isSameDay(day.date, openingDate) && !day.disabled)
    ?? calendarDays.value.find(day => day.isToday && !day.disabled)
    ?? calendarDays.value.find(day => !day.disabled)
  focusedDay.value = preferred ? formatDate(preferred.date) : ''
  if (keyboardOpened.value)
    void nextTick(focusCalendarDay)
}

function focusCalendarDay() {
  if (!showPicker.value)
    return
  const panel = panelRef.value
  const button = panel?.querySelector<HTMLButtonElement>(`[data-date="${focusedDay.value}"]`)
  if (!panel || !button)
    return
  button.focus({ preventScroll: true })
  // Keep keyboard navigation within the popup instead of scrolling the page.
  const bounds = panel.getBoundingClientRect()
  const day = button.getBoundingClientRect()
  if (day.top < bounds.top)
    panel.scrollTop -= bounds.top - day.top
  else if (day.bottom > bounds.bottom)
    panel.scrollTop += day.bottom - bounds.bottom
}

function handleDayKeydown(event: KeyboardEvent, date: Date) {
  if (event.isComposing)
    return
  const dayOffsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -date.getDay(), End: 6 - date.getDay() }
  let target: Date
  if (event.key in dayOffsets) {
    target = new Date(date.getFullYear(), date.getMonth(), date.getDate() + dayOffsets[event.key])
  }
  else if (event.key === 'PageUp' || event.key === 'PageDown') {
    const offset = (event.key === 'PageUp' ? -1 : 1) * (event.shiftKey ? 12 : 1)
    const month = new Date(date.getFullYear(), date.getMonth() + offset, 1)
    target = new Date(month.getFullYear(), month.getMonth(), Math.min(date.getDate(), new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()))
  }
  else {
    return
  }
  event.preventDefault()
  if (isDateDisabled(target))
    return
  focusedDay.value = formatDate(target)
  currentYear.value = target.getFullYear()
  currentMonth.value = target.getMonth()
  void nextTick(focusCalendarDay)
}

watch(calendarDays, (days) => {
  if (!days.some(day => formatDate(day.date) === focusedDay.value && !day.disabled)) {
    const available = days.find(day => day.month === 'current' && !day.disabled) ?? days.find(day => !day.disabled)
    focusedDay.value = available ? formatDate(available.date) : ''
  }
})

function retirePanel(element: Element) {
  element.setAttribute('inert', '')
  element.setAttribute('aria-hidden', 'true')
}

// 处理输入框点击
function handleInputClick() {
  if (!isInputMode.value) {
    openPicker()
  }
}

// 处理输入框获得焦点
function handleInputFocus() {
  isInputMode.value = true
  showPicker.value = false
}

// 处理输入框失去焦点
function handleInputBlur() {
  isInputMode.value = false
  if (props.disabled || !props.active) {
    inputValue.value = displayValue.value
    return
  }
  const parsedDate = parseLocalCalendarDate(inputValue.value)
  const date = parsedDate ? toLocalDate(parsedDate) : null

  if (date && !Number.isNaN(date.getTime())) {
    // 检查日期是否有效且不超过最大日期
    if (!isDateDisabled(date)) {
      emit('update:modelValue', formatDate(date))
    }
    else {
      // 如果日期无效，恢复到原值
      inputValue.value = displayValue.value
    }
  }
  else if (inputValue.value.trim() === '') {
    // 如果输入为空，清除日期
    emit('update:modelValue', '')
  }
  else {
    // 如果输入格式不正确，恢复到原值
    inputValue.value = displayValue.value
  }
}

// 处理输入框的键盘事件
function handleInputKeydown(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229)
    return
  if (event.key === 'Enter') {
    ;(event.target as HTMLInputElement).blur()
  }
  else if (event.key === 'Escape') {
    inputValue.value = displayValue.value
    ;(event.target as HTMLInputElement).blur()
  }
}

// 点击外部关闭
onClickOutside(pickerRef, () => closePicker(), { ignore: [panelRef] })

// 月份名称
const monthNames = computed(() => Array.from({ length: 12 }, (_, index) =>
  t('search.date_picker.month', { month: index + 1 })))
const weekDays = computed(() => [
  t('search.date_picker.weekday_sunday'),
  t('search.date_picker.weekday_monday'),
  t('search.date_picker.weekday_tuesday'),
  t('search.date_picker.weekday_wednesday'),
  t('search.date_picker.weekday_thursday'),
  t('search.date_picker.weekday_friday'),
  t('search.date_picker.weekday_saturday'),
])
</script>

<template>
  <div
    ref="pickerRef" class="date-picker" :class="{ 'date-picker--embedded': embedded }" pos="relative" @keydown="handlePickerKeydown"
    @focusout="handlePickerFocusOut"
  >
    <!-- 输入框显示 -->
    <div class="date-picker-input-wrapper">
      <input
        v-model="inputValue"
        type="text"
        autocomplete="off" :spellcheck="false"
        class="date-picker-input"
        :class="{ 'has-value': modelValue }"
        :aria-label="pickerLabel" :aria-invalid="invalid || undefined" :disabled="disabled || !active"
        :placeholder="placeholder || $t('search.date_picker.start_date')"
        @click="handleInputClick"
        @focus="handleInputFocus"
        @blur="handleInputBlur"
        @keydown="handleInputKeydown"
      >
      <button
        ref="triggerRef"
        type="button"
        class="calendar-icon"
        :aria-label="label ? $t('search.date_picker.open_calendar_for', { label }) : $t('search.date_picker.open_calendar')"
        :disabled="disabled || !active"
        aria-haspopup="dialog"
        :aria-expanded="showPicker"
        :aria-controls="showPicker ? pickerId : undefined"
        @click="openPicker"
      >
        <div class="i-tabler:calendar" w-4 h-4 />
      </button>
    </div>

    <!-- 日历弹出框 -->
    <Teleport :to="teleportTarget || 'body'" :disabled="!teleportTarget">
      <Transition name="dropdown" :css="!keyboardOpened" @before-leave="retirePanel">
        <div
          v-if="showPicker" :id="pickerId" ref="panelRef" role="dialog"
          :aria-label="pickerLabel"
          class="date-picker-panel bew-popover-surface"
          :class="{ 'date-picker-panel--portaled': teleport, 'date-picker-panel--embedded': embedded }"
          @keydown="handlePickerKeydown" @focusout="handlePickerFocusOut"
        >
          <!-- 头部：年月选择 -->
          <div class="picker-header">
            <div class="year-controls">
              <button type="button" class="header-btn" :aria-label="$t('search.date_picker.previous_year')" @click="prevYear">
                <div class="i-tabler:chevron-left" w-4 h-4 />
              </button>
              <span class="year-text">{{ $t('search.date_picker.year', { year: currentYear }) }}</span>
              <button type="button" class="header-btn" :aria-label="$t('search.date_picker.next_year')" @click="nextYear">
                <div class="i-tabler:chevron-right" w-4 h-4 />
              </button>
            </div>
            <div class="month-controls">
              <button type="button" class="header-btn" :aria-label="$t('search.date_picker.previous_month')" @click="prevMonth">
                <div class="i-tabler:chevron-up" w-5 h-5 />
              </button>
              <div class="month-text">
                {{ monthNames[currentMonth] }}
              </div>
              <button type="button" class="header-btn" :aria-label="$t('search.date_picker.next_month')" @click="nextMonth">
                <div class="i-tabler:chevron-down" w-5 h-5 />
              </button>
            </div>
          </div>

          <!-- 星期标题 -->
          <div class="picker-weekdays">
            <div v-for="day in weekDays" :key="day" class="weekday">
              {{ day }}
            </div>
          </div>

          <!-- 日期网格 -->
          <div class="picker-days">
            <button
              v-for="(day, index) in calendarDays"
              :key="index"
              type="button"
              class="day-cell"
              :class="{
                'other-month': day.month !== 'current',
                'disabled': day.disabled,
                'today': day.isToday,
                'selected': day.isSelected,
              }"
              :disabled="day.disabled"
              :aria-disabled="day.disabled"
              :aria-pressed="day.isSelected"
              :aria-label="$t('search.date_picker.select_date', { date: formatDate(day.date) })"
              :data-date="formatDate(day.date)" :tabindex="formatDate(day.date) === focusedDay ? 0 : -1"
              @focus="focusedDay = formatDate(day.date)" @keydown="handleDayKeydown($event, day.date)"
              @click="selectDate(day)"
            >
              {{ day.day }}
            </button>
          </div>

          <!-- 底部按钮 -->
          <div class="picker-footer">
            <button type="button" class="footer-btn clear" @click="clearDate">
              {{ $t('search.date_picker.clear') }}
            </button>
            <button type="button" class="footer-btn today" :disabled="isDateDisabled(new Date())" @click="selectToday">
              {{ $t('search.date_picker.today') }}
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
.date-picker {
  display: inline-block;
}
.date-picker--embedded {
  display: block;
  min-width: 0;
  .date-picker-input-wrapper {
    width: 100%;
  }
  .date-picker-input {
    min-width: 0;
    border: 0;
    color: var(--bew-text-1);
    &::placeholder {
      color: var(--bew-text-2);
    }
    &:focus-visible {
      outline: none;
      box-shadow: none;
      color: var(--bew-on-theme-surface);
      background: var(--bew-theme-surface);
    }
  }
}
.date-picker-input::selection {
  background: var(--bew-theme-color);
  color: var(--bew-on-theme-color);
}

.date-picker-input-wrapper {
  position: relative;
  display: inline-flex;
  align-items: center;
  width: var(--bew-date-picker-input-width);
}

.date-picker-input {
  flex: 1;
  width: 100%;
  min-height: var(--bew-control-height);
  padding: 0 var(--bew-space-8) 0 var(--bew-space-2);
  background: var(--bew-fill-1);
  box-sizing: border-box;
  border: var(--bew-hairline) solid var(--bew-edge-color);
  border-radius: var(--bew-interactive-radius);
  corner-shape: var(--bew-corner-shape);
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-regular);
  line-height: var(--bew-line-height-control);
  transition:
    background-color var(--bew-duration-normal) var(--bew-ease-out),
    color var(--bew-duration-normal) var(--bew-ease-out),
    border-color var(--bew-duration-normal) var(--bew-ease-out),
    box-shadow var(--bew-duration-normal) var(--bew-ease-out),
    transform var(--bew-duration-normal) var(--bew-ease-out);
  outline: none;

  &::placeholder {
    color: var(--bew-text-3);
  }

  &.has-value {
    color: var(--bew-text-1);
  }

  &:hover:not(:disabled) {
    background: var(--bew-fill-2);
  }

  &:focus {
    background: var(--bew-fill-2);
  }
}

.calendar-icon {
  position: absolute;
  right: var(--bew-space-1);
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--bew-control-height-sm);
  height: var(--bew-control-height-sm);
  padding: 0;
  border-radius: var(--bew-interactive-radius);
  background: transparent;
  border: none;
  color: var(--bew-text-3);
  cursor: pointer;
  transition:
    background-color var(--bew-duration-normal) var(--bew-ease-out),
    color var(--bew-duration-normal) var(--bew-ease-out),
    border-color var(--bew-duration-normal) var(--bew-ease-out),
    box-shadow var(--bew-duration-normal) var(--bew-ease-out),
    transform var(--bew-duration-normal) var(--bew-ease-out);

  &:hover {
    color: var(--bew-text-1);
  }

  &:active {
    transform: scale(0.95);
  }
}

.date-picker-panel {
  position: fixed;
  top: 0;
  left: 0;
  z-index: var(--bew-z-base-overlay);
  width: min(var(--bew-date-picker-panel-width), calc(100vw - var(--bew-space-8)));
  max-height: calc(100dvh - var(--bew-space-8));
  box-sizing: border-box;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: var(--bew-space-3);

  &::selection,
  :deep(::selection) {
    color: var(--bew-on-theme-color);
    background: var(--bew-theme-color);
  }
}
.date-picker-panel--portaled {
  z-index: var(--bew-z-popover);
}
.date-picker-panel--embedded {
  .weekday {
    color: var(--bew-text-2);
  }
  .year-text,
  .month-text {
    min-width: var(--bew-space-8);
    font-size: var(--bew-font-size-control);
    line-height: var(--bew-line-height-control);
  }
}
.date-picker-panel .footer-btn:disabled,
.date-picker .calendar-icon:disabled {
  color: var(--bew-text-3);
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bew-space-3);
  margin-bottom: var(--bew-space-3);
  padding: 0 var(--bew-space-1);
}

.year-controls,
.month-controls {
  display: flex;
  align-items: center;
  gap: var(--bew-space-1);
}

.year-text,
.month-text {
  min-width: 60px;
  text-align: center;
  font-size: var(--bew-font-size-body);
  font-weight: var(--bew-font-weight-regular);
  line-height: var(--bew-line-height-body);
  color: var(--bew-text-1);
}

.header-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--bew-icon-button-size-sm);
  height: var(--bew-icon-button-size-sm);
  background: transparent;
  border: none;
  border-radius: var(--bew-interactive-radius);
  corner-shape: var(--bew-corner-shape);
  color: var(--bew-text-2);
  cursor: pointer;
  transition:
    background-color var(--bew-duration-normal) var(--bew-ease-out),
    color var(--bew-duration-normal) var(--bew-ease-out),
    border-color var(--bew-duration-normal) var(--bew-ease-out),
    box-shadow var(--bew-duration-normal) var(--bew-ease-out),
    transform var(--bew-duration-normal) var(--bew-ease-out);

  &:hover {
    background: var(--bew-fill-1);
    color: var(--bew-text-1);
  }

  &:active {
    transform: scale(0.95);
  }
}

.picker-weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: var(--bew-space-1);
  margin-bottom: var(--bew-space-1);
}

.weekday {
  display: flex;
  align-items: center;
  justify-content: center;
  height: var(--bew-date-picker-day-size);
  font-size: var(--bew-font-size-control);
  color: var(--bew-text-3);
  font-weight: var(--bew-font-weight-regular);
}

.picker-days {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: var(--bew-space-1);
  margin-bottom: var(--bew-space-3);
}

.day-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  height: var(--bew-date-picker-day-size);
  background: transparent;
  border: none;
  border-radius: var(--bew-interactive-radius);
  corner-shape: var(--bew-corner-shape);
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-body);
  font-weight: var(--bew-font-weight-regular);
  font-family: var(--bew-fonts-monospace);
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  transition:
    background-color var(--bew-duration-normal) var(--bew-ease-out),
    color var(--bew-duration-normal) var(--bew-ease-out),
    border-color var(--bew-duration-normal) var(--bew-ease-out),
    box-shadow var(--bew-duration-normal) var(--bew-ease-out),
    transform var(--bew-duration-normal) var(--bew-ease-out);

  &:hover:not(.disabled) {
    background: var(--bew-fill-1);
  }

  &.other-month {
    color: var(--bew-text-2);
  }

  &.disabled {
    color: var(--bew-text-4);
    cursor: not-allowed;
    opacity: 0.5;
  }

  &.today {
    color: var(--bew-text-1);
    box-shadow: var(--bew-selected-ring);
  }

  &.selected {
    background: var(--bew-selected-bg);
    color: var(--bew-text-1);
    box-shadow: var(--bew-selected-ring);

    &:hover {
      background: var(--bew-pressed-bg);
    }
  }

  &:active:not(.disabled) {
    transform: scale(0.95);
  }
}

.picker-footer {
  display: flex;
  justify-content: space-between;
  padding-top: var(--bew-space-2);
  border-top: var(--bew-hairline) solid var(--bew-separator-color);
}

.footer-btn {
  min-height: var(--bew-control-height-sm);
  padding: 0 var(--bew-space-3);
  background: transparent;
  border: none;
  border-radius: var(--bew-interactive-radius);
  corner-shape: var(--bew-corner-shape);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-regular);
  line-height: var(--bew-line-height-control);
  cursor: pointer;
  &:disabled {
    color: var(--bew-text-3);
    cursor: not-allowed;
  }
  transition:
    background-color var(--bew-duration-normal) var(--bew-ease-out),
    color var(--bew-duration-normal) var(--bew-ease-out),
    border-color var(--bew-duration-normal) var(--bew-ease-out),
    box-shadow var(--bew-duration-normal) var(--bew-ease-out),
    transform var(--bew-duration-normal) var(--bew-ease-out);

  &.clear {
    color: var(--bew-text-2);

    &:hover:not(:disabled) {
      background: var(--bew-fill-1);
      color: var(--bew-text-1);
    }
  }

  &.today {
    color: var(--bew-text-1);

    &:hover:not(:disabled) {
      background: var(--bew-theme-surface);
    }
  }

  &:active {
    transform: scale(0.95);
  }
}

@media (prefers-reduced-motion: reduce) {
  .date-picker button,
  .date-picker button:active,
  .date-picker-input {
    transition: none;
    transform: none;
  }
}
</style>
