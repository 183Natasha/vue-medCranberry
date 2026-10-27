<template>
  <details class="collapsible" :open="open">
    <summary class="collapsible-header">
      <span class="collapsible-title">
        <span class="chevron" aria-hidden="true">▸</span>
        <slot name="title">{{ title }}</slot>
      </span>
      <span class="collapsible-badges">
        <slot name="badges" />
      </span>
    </summary>
    <div class="collapsible-body">
      <slot />
    </div>
  </details>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ title?: string; open?: boolean }>(), {
  title: '',
  open: false,
})
</script>
