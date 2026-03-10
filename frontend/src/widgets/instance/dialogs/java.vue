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
/* 容器內邊距 */
.java-config-container {
  padding: 8px 4px;
}

.desc-text {
  margin-bottom: 20px;
  font-size: 14px;
}

/* 核心 Grid 佈局 */
.version-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  width: 100%;
  margin-bottom: 24px;
}

/* --- 關鍵修正：重置 AntD Radio Button 邊框機制 --- */
.version-card-item {
  height: 44px !important;
  padding: 0 8px !important;
  line-height: 42px !important; /* 扣除上下邊框 1px * 2 */
  text-align: center;
  border-radius: 8px !important;
  background: var(--ant-color-bg-container);
  color: var(--ant-color-text);
  transition: all 0.2s ease;
  
  /* 強制恢復被 AntD 隱藏的左邊框 */
  border-inline-start: 1px solid var(--ant-color-border) !important;
  border: 1px solid var(--ant-color-border) !important;
  margin-inline-start: 0 !important; 
  position: relative;
}

/* 移除 AntD 用於處理緊貼按鈕的分割線偽元素 */
.version-card-item::before {
  display: none !important; 
}

/* 選中狀態樣式優化 */
.ant-radio-button-wrapper-checked:not(.ant-radio-button-wrapper-disabled) {
  background: var(--ant-color-primary-bg) !important;
  border-color: var(--ant-color-primary) !important;
  color: var(--ant-color-primary) !important;
  z-index: 2;
}

/* 懸停狀態 */
.version-card-item:hover {
  border-color: var(--ant-color-primary) !important;
  color: var(--ant-color-primary);
  z-index: 1;
}

.btn-content {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  height: 100%;
}

.check-icon {
  font-size: 12px;
}

.label-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}

/* 信息卡片 */
.info-card {
  background: var(--ant-color-primary-bg); 
  border-radius: 10px;
  padding: 16px;
  border: 1px solid var(--ant-color-primary-border);
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.info-label {
  color: var(--ant-color-text-description);
  font-size: 13px;
  flex-shrink: 0;
}

.info-value {
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0; /* 允許內層省略 */
}

.file-name {
  word-break: break-all;
  font-family: monospace;
}

.highlight {
  color: var(--ant-color-primary);
}

.card-divider {
  margin: 12px 0;
  border-color: var(--ant-color-split);
}

.notice-box {
  display: flex;
  gap: 8px;
  color: var(--ant-color-warning-text);
  font-size: 12px;
  line-height: 1.5;
  align-items: flex-start;
}

/* --- 移動端適配 --- */
@media (max-width: 576px) {
  .version-grid {
    grid-template-columns: repeat(2, 1fr);
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

/* 動畫效果 */
.fade-enter-active, .fade-leave-active {
  transition: all 0.3s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
  transform: translateY(10px);
}
</style>
