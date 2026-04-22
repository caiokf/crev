<script setup lang="ts">
import { ref, onMounted, watch } from "vue"
import { RouterLink, useRoute } from "vue-router"
import type { NavSection } from "../data/nav"

const props = defineProps<{
  sections: NavSection[]
  defaultSection: string
  docSections: NavSection[]
  guideSections: NavSection[]
  docsExpandedDefault?: boolean
  guidesExpandedDefault?: boolean
  /** Route prefix for cross-links to docs (e.g. "/docs") */
  docsLinkPrefix: string
  /** Route prefix for cross-links to guides (e.g. "/docs/guides") */
  guidesLinkPrefix: string
  /** Which group is "local" (scrollable) vs "linked" (RouterLink) */
  activePage: "docs" | "guides"
}>()

const route = useRoute()
const activeSection = ref(props.defaultSection)
const docsExpanded = ref(props.docsExpandedDefault ?? true)
const guidesExpanded = ref(props.guidesExpandedDefault ?? true)
const mobileNav = ref(false)

function scrollTo(id: string) {
  activeSection.value = id
  mobileNav.value = false
  const el = document.getElementById(id)
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" })
}

onMounted(() => {
  if (route.hash) {
    activeSection.value = route.hash.slice(1)
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          activeSection.value = e.target.id
        }
      }
    },
    { rootMargin: "-80px 0px -60% 0px", threshold: 0 },
  )
  props.sections.forEach((s) => {
    const el = document.getElementById(s.id)
    if (el) observer.observe(el)
  })
})

watch(() => route.hash, (hash) => {
  if (hash) scrollTo(hash.slice(1))
})

defineExpose({ scrollTo, activeSection })
</script>

<template>
  <div class="docs">
    <button class="mobile-nav-toggle" @click="mobileNav = !mobileNav">
      &#9776; {{ mobileNav ? 'Close' : 'Menu' }}
    </button>
    <aside :class="['sidebar', { open: mobileNav }]">
      <div class="sidebar-inner">
        <button class="sidebar-title" :class="{ active: docsExpanded }" @click="docsExpanded = !docsExpanded">
          <span class="toggle-icon">&#9656;</span> Documentation
        </button>
        <nav v-if="docsExpanded" class="sidebar-nav">
          <template v-if="activePage === 'docs'">
            <a
              v-for="s in docSections"
              :key="s.id"
              :href="'#' + s.id"
              :class="{ active: activeSection === s.id }"
              @click.prevent="scrollTo(s.id)"
            >
              {{ s.label }}
            </a>
          </template>
          <template v-else>
            <RouterLink
              v-for="s in docSections"
              :key="s.id"
              :to="docsLinkPrefix + '#' + s.id"
            >
              {{ s.label }}
            </RouterLink>
          </template>
        </nav>
        <button class="sidebar-title" :class="{ active: guidesExpanded }" @click="guidesExpanded = !guidesExpanded">
          <span class="toggle-icon">&#9656;</span> User Guides
        </button>
        <nav v-if="guidesExpanded" class="sidebar-nav">
          <template v-if="activePage === 'guides'">
            <a
              v-for="s in guideSections"
              :key="s.id"
              :href="'#' + s.id"
              :class="{ active: activeSection === s.id }"
              @click.prevent="scrollTo(s.id)"
            >
              {{ s.label }}
            </a>
          </template>
          <template v-else>
            <RouterLink
              v-for="s in guideSections"
              :key="s.id"
              :to="guidesLinkPrefix + '#' + s.id"
            >
              {{ s.label }}
            </RouterLink>
          </template>
        </nav>
      </div>
    </aside>

    <main class="content">
      <slot />
    </main>
  </div>
</template>
