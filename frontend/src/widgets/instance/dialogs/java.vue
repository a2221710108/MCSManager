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
/* --- 基礎容器與描述 --- */
.java-config-container {
  padding: 8px 4px;
}

.desc-text {
  margin-bottom: 20px;
  font-size: 14px;
  /* 使用 currentColor 或不指定顏色，僅通過 opacity 實現灰度感 */
  /* 這樣在深色模式下，它會是半透明的白色；淺色下是半透明的黑色 */
  color: inherit !important;
  opacity: 0.65; 
}

/* --- 網格佈局 (Grid) --- */
.version-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  width: 100%;
  margin-bottom: 24px;
}

/* --- 單個按鈕卡片樣式 --- */
.version-card-item {
  height: auto !important;
  padding: 10px 8px !important;
  line-height: 1.5 !important;
  text-align: center;
  border-radius: 8px !important;
  /* 邊框使用半透明，適配所有背景 */
  border: 1px solid rgba(140, 140, 140, 0.2) !important;
  transition: all 0.2s cubic-bezier(0.645, 0.045, 0.355, 1);
  background: transparent !important;
  /* 確保初始文字顏色正確 */
  color: inherit !important;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 移除 AntD 默認的左側分隔線 */
.version-card-item:before {
  display: none !important;
}

/* --- 選中狀態 (核心修復) --- */
.version-card-item.ant-radio-button-wrapper-checked {
  border-color: #1677ff !important;
  /* 強制文字為品牌藍，避免變白看不清 */
  color: #1677ff !important;
  background: rgba(22, 119, 255, 0.1) !important;
  box-shadow: 0 2px 8px rgba(22, 119, 255, 0.15);
}

.version-card-item.ant-radio-button-wrapper-checked .label-text {
  font-weight: 600; /* 選中時文字加粗 */
}

/* 懸停效果 */
.version-card-item:hover {
  border-color: #4096ff !important;
  color: #4096ff !important;
  background: rgba(22, 119, 255, 0.05) !important;
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
}

.label-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* --- 依賴檔案信息卡片 (深色模式適配) --- */
.info-card {
  /* 背景使用 6% 的品牌藍，深色模式下會呈現深邃感 */
  background: rgba(22, 119, 255, 0.06); 
  border-radius: 12px;
  padding: 16px;
  border: 1px solid rgba(22, 119, 255, 0.15);
  backdrop-filter: blur(8px); /* 增加磨砂質感 */
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.info-label {
  color: var(--ant-text-color-secondary, rgba(140, 140, 140, 0.8));
  font-size: 13px;
}

.info-value {
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  /* 檔案名稱背景框，深淺模式通用 */
  background: rgba(140, 140, 140, 0.1); 
  border-radius: 6px;
  color: #1677ff; /* 檔案名稱高亮色 */
}

.file-name {
  word-break: break-all;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 13px;
}

.card-divider {
  margin: 12px 0;
  /* 分割線透明度化 */
  border-color: rgba(22, 119, 255, 0.1) !important;
}

.notice-box {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  color: #fa8c16; /* 警告色 */
  font-size: 12px;
  line-height: 1.6;
}

.notice-box :deep(.anticon) {
  margin-top: 3px;
}

/* --- 響應式適配 --- */
@media (max-width: 576px) {
  .version-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }
}

@media (max-width: 380px) {
  .version-grid {
    grid-template-columns: 1fr;
  }
  .info-row {
    flex-direction: column;
    align-items: flex-start;
  }
}

/* --- 動畫效果 --- */
.fade-enter-active, .fade-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
  transform: translateY(10px);
}
</style>
