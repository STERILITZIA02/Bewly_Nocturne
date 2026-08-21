<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { genreChannelConfigs, otherChannelConfigs } from '../../constants/channels'

const { t } = useI18n()

const genres = computed(() => {
  return genreChannelConfigs.map((config) => {
    return {
      ...config,
      name: t(config.nameKey),
    }
  })
})

const otherLinks = computed(() => {
  return otherChannelConfigs.map((config) => {
    return {
      ...config,
      name: t(config.nameKey),
    }
  })
})
</script>

<template>
  <div
    class="channels-pop bew-popover bew-popover-surface"
    data-key="channels"
  >
    <div class="bew-popover__scroll channels-pop__scroll">
      <div class="channels-pop__columns">
        <ul
          v-for="(item, index) in [0, 10, 20, 30]"
          :key="index"
          class="link-list"
        >
          <li
            v-for="genre in genres.slice(item, item + 10)"
            :key="genre.name"
            class="link-item"
          >
            <ALink
              :href="genre.href"
              type="topBar"
            >
              <svg aria-hidden="true" class="svg-icon">
                <use :xlink:href="genre.icon" />
              </svg>
              <span>{{ genre.name }}</span>
            </ALink>
          </li>
        </ul>
        <ul
          v-for="(item, index) in [0]"
          :key="index"
          class="link-list"
        >
          <li
            v-for="otherLink in otherLinks.slice(item, item + 10)"
            :key="otherLink.name"
            class="link-item group"
          >
            <ALink
              :href="otherLink.href"
              type="topBar"
            >
              <div v-if="otherLink.icon.startsWith('#')" class="icon">
                <svg
                  aria-hidden="true"
                >
                  <use :xlink:href="otherLink.icon" />
                </svg>
              </div>

              <div
                v-else
                class="icon"
              >
                <i
                  :class="otherLink.icon"
                  :style="{ color: otherLink.color }"
                />
              </div>
              <span>{{ otherLink.name }}</span>
            </ALink>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.channels-pop {
  width: fit-content;
  max-height: min(445px, var(--bew-popover-max-height));
}

.channels-pop__scroll {
  padding: var(--bew-popover-padding);
}

.channels-pop__columns {
  display: grid;
  grid-template-columns: repeat(5, minmax(148px, 160px));
  gap: var(--bew-space-1);
}

.link-item {
  --uno: "mb-1 last-of-type:mb-0";

  a {
    --uno: "flex items-center text-nowrap p-2 pr-3";
    min-width: 148px;
    min-height: var(--bew-popover-row-min-height);
    border-radius: var(--bew-interactive-radius);
    corner-shape: var(--bew-corner-shape);
    font-size: var(--bew-font-size-control);
    transition: background-color var(--bew-duration-fast) var(--bew-ease-standard);

    &:hover {
      background: var(--bew-fill-1);
    }
  }
}

@media (max-width: 900px) {
  .channels-pop__columns {
    grid-template-columns: repeat(3, minmax(148px, 1fr));
  }
}

@media (max-width: 560px) {
  .channels-pop__columns {
    grid-template-columns: repeat(2, minmax(132px, 1fr));
  }

  .link-item a {
    min-width: 132px;
  }
}

@media (max-width: 360px) {
  .channels-pop__columns {
    grid-template-columns: minmax(0, 1fr);
  }

  .link-item a {
    min-width: 0;
  }
}

.svg-icon {
  --uno: "w-2em h-2em mr-3 vertical-bottom fill-current overflow-hidden";
}

.icon {
  --uno: "w-2em h-2em mr-3 bg-$bew-content-solid vertical-bottom fill-current overflow-hidden";
  --uno: "text-1.25em grid place-items-center rounded-1/2 shrink-0";
  --uno: "border-1 border-$bew-border-color";

  svg {
    --uno: "w-1.25em h-1.25em";
  }
}
</style>
