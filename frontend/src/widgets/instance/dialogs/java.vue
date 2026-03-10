<script setup lang="ts">
import { t } from "@/lang/i18n";
import { updateAnyInstanceConfig } from "@/services/apis/instance";
import { reportErrorMsg } from "@/tools/validator";
import type { InstanceDetail } from "@/types";
import { CheckOutlined, FileTextOutlined } from "@ant-design/icons-vue";
import { message } from "ant-design-vue";
import _ from "lodash";
import { ref, computed } from "vue";

const props = defineProps<{
  instanceInfo?: InstanceDetail;
  instanceId?: string;
  daemonId?: string;
}>();

const emit = defineEmits(["update"]);

/**
 * 定義 Java 配置映射
 * script: 最終寫入數據庫的啟動指令
 * jarFile: 提示用戶需要準備的啟動檔案名稱
 */
const JAVA_VERSIONS = [
  { label: "Java 6", value: "6", script: "/home/steam/start_6_mc.sh", jarFile: "startmc.jar" },
  { label: "Java 8", value: "8", script: "/home/steam/newstart_8_mc.sh", jarFile: "startmc.jar" },
  { label: "Java 17", value: "17", script: "/home/steam/newstart_17_mc.sh", jarFile: "startmc.jar" },
  { label: "Java 21", value: "21", script: "/home/steam/newstart_21_mc.sh", jarFile: "startmc.jar" },
  { label: "21(Forge/NeoForge)", value: "21F", script: "/home/steam/start_21_newforge.sh", jarFile: "run.sh" },
  { label: "Java 25", value: "25", script: "/home/steam/start_25_mc.sh", jarFile: "startmc.jar" }
];

const open = ref(false);
const selectedJava = ref<string>("17");
const { execute, isLoading } = updateAnyInstanceConfig();

// 計算目前選中的版本完整信息
const currentSelection = computed(() => {
  return JAVA_VERSIONS.find((v) => v.value === selectedJava.value);
});

const initSelection = () => {
  const currentCmd = props.instanceInfo?.config?.startCommand || "";
  const found = JAVA_VERSIONS.find((v) => currentCmd.includes(v.script));
  selectedJava.value = found ? found.value : "17";
};

const openDialog = () => {
  // 檢查伺服器狀態：假設 status 為 0 代表已停止
  if (props.instanceInfo && props.instanceInfo.status !== 0) {
    return message.error(t("必須先關閉伺服器才能切換 Java 版本！"));
  }
  initSelection();
  open.value = true;
};

const submit = async () => {
  try {
    if (!currentSelection.value || !props.instanceInfo?.config) return;

    // 克隆完整配置並修改 startCommand
    const postData = _.cloneDeep(props.instanceInfo.config);
    postData.startCommand = currentSelection.value.script;

    await execute({
      params: {
        uuid: props.instanceId ?? "",
        daemonId: props.daemonId ?? ""
      },
      data: postData
    });

    message.success(`${t("已切換至")} ${currentSelection.value.label}`);
    emit("update");
    open.value = false;
  } catch (error: any) {
    return reportErrorMsg(error.message || t("切換失敗"));
  }
};

defineExpose({ openDialog });
</script>

<template>
  <a-modal
    v-model:open="open"
    centered
    :title="t('切換 Java 版本')"
    :confirm-loading="isLoading"
    :width="520" 
    @ok="submit"
  >
    <div class="java-config-container">
      <a-typography-paragraph type="secondary" class="desc-text">
        {{ t("請選擇合適的 Java 版本，系統將根據選擇調整啟動參數。") }}
      </a-typography-paragraph>

      <a-radio-group v-model:value="selectedJava" button-style="solid" class="version-grid">
        <a-radio-button 
          v-for="item in JAVA_VERSIONS" 
          :key="item.value" 
          :value="item.value"
          class="version-card-item"
        >
          <div class="btn-content">
            <check-outlined v-if="selectedJava === item.value" class="check-icon" />
            <span class="label-text">{{ item.label }}</span>
          </div>
        </a-radio-button>
      </a-radio-group>

      <transition name="fade">
        <div v-if="currentSelection" class="info-card">
          <div class="info-row">
            <span class="info-label">{{ t("依賴啟動檔案") }}</span>
            <span class="info-value highlight">
              <file-text-outlined />
              <span class="file-name">{{ currentSelection.jarFile }}</span>
            </span>
          </div>
          
          <a-divider class="card-divider" />
          
          <div class="notice-box">
            <exclamation-circle-outlined />
            <span>{{ t("提示：切換後請確保伺服器根目錄下已放置上述檔案。") }}</span>
          </div>
        </div>
      </transition>
    </div>
  </a-modal>
</template>

<style scoped>
.java-config-container {
  padding: 8px 4px;
}

.desc-text {
  margin-bottom: 20px;
  font-size: 14px;
}

/* --- 核心 Grid 佈局 --- */
.version-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  width: 100%;
  margin-bottom: 24px;
}

/* 參考你提供的設計：移除寫死的高度，改用 padding 並強化過渡 */
:deep(.ant-radio-button-wrapper) {
  height: auto !important;
  padding: 10px 8px !important;
  text-align: center;
  border: 1px solid var(--ant-color-border-secondary) !important;
  border-radius: 8px !important;
  background: var(--ant-color-bg-container);
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 移除 AntD 原生的按鈕間左側線條 */
:deep(.ant-radio-button-wrapper::before) {
  display: none !important;
}

/* --- 選中狀態：兼容深色模式的核心修改 --- */
:deep(.ant-radio-button-wrapper-checked) {
  /* 使用透明藍背景，這樣在深色模式下會透出底部的黑色，看起來是深藍 */
  background: rgba(var(--ant-color-primary-rgb), 0.15) !important;
  color: var(--ant-color-primary) !important;
  border-color: var(--ant-color-primary) !important;
  /* 使用動態陰影變量 */
  box-shadow: 0 2px 8px var(--ant-color-primary-outline) !important;
}

/* 懸停效果：參考備份管理員的 hover 邏輯 */
:deep(.ant-radio-button-wrapper:hover:not(.ant-radio-button-wrapper-checked)) {
  background: var(--ant-color-fill-alter);
  border-color: var(--ant-color-primary-hover) !important;
  color: var(--ant-color-primary-hover);
}

.btn-content {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
}

.check-icon {
  font-size: 12px;
  flex-shrink: 0;
  /* 勾選圖標顏色跟隨主題 */
  color: var(--ant-color-primary);
}

.label-text {
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* --- 信息卡片：增強對比度 --- */
.info-card {
  /* 使用更具層次感的背景變量 */
  background: var(--ant-color-fill-quaternary);
  border-radius: 12px;
  padding: 16px;
  border: 1px solid var(--ant-color-border-secondary);
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.info-label {
  color: var(--ant-color-text-description);
  font-size: 13px;
}

.info-value {
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
}

/* 亮藍色文字在深色模式下會自動調整亮度（若使用 link 變量） */
.highlight {
  color: var(--ant-color-link);
}

.card-divider {
  margin: 12px 0;
  border-block-start: 1px solid var(--ant-color-border-subtle);
}

.notice-box {
  display: flex;
  gap: 8px;
  color: var(--ant-color-warning-text);
  font-size: 12px;
  line-height: 1.6;
  /* 參考 a-alert 的底色邏輯 */
  background: var(--ant-color-warning-bg);
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--ant-color-warning-border);
}

.warning-icon {
  margin-top: 2px;
}

/* --- 響應式佈局 --- */
@media (max-width: 576px) {
  .version-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 380px) {
  .version-grid {
    grid-template-columns: 1fr;
  }
}

/* 動畫效果保持不變 */
.fade-enter-active, .fade-leave-active {
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
  transform: translateY(6px);
}
</style>
