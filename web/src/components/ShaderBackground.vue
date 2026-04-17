<script setup lang="ts">
import { Shader, Ascii, SineWave, Perspective } from "shaders/vue"
</script>

<template>
  <Shader class="shader-bg">
    <Ascii
      characters="@%#*+=-:. "
      :cellSize="14"
      fontFamily="JetBrains Mono"
      :spacing="1"
      :gamma="0.8"
    >
      <Perspective
        :tilt="-40"
        :pan="5"
        :fov="70"
        :zoom="1.2"
        edges="stretch"
      >
        <SineWave
          color="#ff8c00"
          :amplitude="0.18"
          :frequency="3"
          :speed="0.6"
          :thickness="0.35"
          :softness="0.5"
          :position="{ x: 0.5, y: 0.45 }"
        />
        <SineWave
          color="#e06000"
          :amplitude="0.14"
          :frequency="2.2"
          :speed="0.4"
          :thickness="0.25"
          :softness="0.6"
          :position="{ x: 0.5, y: 0.55 }"
          :angle="5"
        />
        <SineWave
          color="#ffaa00"
          :amplitude="0.1"
          :frequency="4"
          :speed="0.8"
          :thickness="0.2"
          :softness="0.4"
          :position="{ x: 0.5, y: 0.5 }"
          :angle="-3"
        />
      </Perspective>
    </Ascii>
  </Shader>
</template>

<style scoped>
.shader-bg {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
  opacity: 0.4;
  pointer-events: none;
}
</style>
