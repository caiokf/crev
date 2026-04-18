import { createRouter, createWebHistory } from "vue-router"
import Home from "./pages/Home.vue"

export const router = createRouter({
  history: createWebHistory("/"),
  routes: [
    { path: "/", component: Home },
    { path: "/docs", component: () => import("./pages/Docs.vue") },
    { path: "/docs/guides", component: () => import("./pages/Guides.vue") },
  ],
  scrollBehavior(to) {
    if (to.hash) return { el: to.hash, behavior: "smooth" }
    return { top: 0 }
  },
})
