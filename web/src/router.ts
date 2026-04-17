import { createRouter, createWebHistory } from "vue-router"
import Home from "./pages/Home.vue"
import Docs from "./pages/Docs.vue"

export const router = createRouter({
  history: createWebHistory("/crev/"),
  routes: [
    { path: "/", component: Home },
    { path: "/docs", component: Docs },
  ],
  scrollBehavior(to) {
    if (to.hash) return { el: to.hash, behavior: "smooth" }
    return { top: 0 }
  },
})
