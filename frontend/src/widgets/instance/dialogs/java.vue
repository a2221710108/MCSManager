<script setup lang="ts">
import { t } from "@/lang/i18n";
import { updateAnyInstanceConfig } from "@/services/apis/instance";
import { reportErrorMsg } from "@/tools/validator";
import type { InstanceDetail } from "@/types";
import { CheckOutlined, WarningOutlined } from "@ant-design/icons-vue";
import { message } from "ant-design-vue";
import _ from "lodash";
import { ref } from "vue";

const props = defineProps<{
  instanceInfo?: InstanceDetail;
  instanceId?: string;
  daemonId?: string;
}>();

const emit = defineEmits(["update"]);

// 定義 Java 版本與對應的啟動指令
const JAVA_VERSIONS = [
  { label: "Java 6", value: "6", script: "./start_6_mc.sh" },
  { label: "Java 8", value: "8", script: "./start_8_mc.sh" },
  { label: "Java 17", value: "17", script: "./start_17_mc.sh" },
  { label: "Java 21", value: "21", script: "./start_21_mc.sh" },
  { label: "Java 25", value: "25", script: "./start_25_mc.sh" }
];

const open = ref(false);
const selectedJava = ref<string>("17");
const { execute, isLoading } = updateAnyInstanceConfig();

// 初始化選擇狀態
const initSelection = () => {
  const currentCmd = props.instanceInfo?.config?.startCommand || "";
  const found = JAVA_VERSIONS.find((v) => currentCmd.includes(v.script));
  selectedJava.value = found ? found.value : "17";
};

const openDialog = () => {
  // 檢查伺服器狀態：假設 status 為 0 代表已停止
  // 如果你的系統狀態定義不同，請修改此處的判斷邏輯
  if (props.instanceInfo && props.instanceInfo.status !== 0) {
    return message.error(t("必須先關閉伺服器才能修改啟動指令！"));
  }
  initSelection();
  open.value = true;
};

const submit = async () => {
  try {
    const targetVersion = JAVA_VERSIONS.find((v) => v.value === selectedJava.value);
    if (!targetVersion) return;

    if (!props.instanceInfo?.config) {
      throw new Error("Instance configuration is missing.");
    }

    // 解決 TS2345: 必須傳遞完整的 IGlobalInstanceConfig 對象
    // 我們克隆目前的完整配置，並僅修改 startCommand 欄位
    const postData = _.cloneDeep(props.instanceInfo.config);
    postData.startCommand = targetVersion.script;

    await execute({
      params: {
        uuid: props.instanceId ?? "",
        daemonId: props.daemonId ?? ""
      },
      data: postData
    });

    message.success(`${t("已成功切換至")} ${targetVersion.label}`);
    emit("update");
    open.value = false;
  } catch (error: any) {
    console.error(error);
    return reportErrorMsg(error.message || t("修改失敗"));
  }
};

defineExpose({
  openDialog
});
</script>

<template>
  <a-modal
    v-model:open="open"
    centered
    :mask-closable="false"
    :title="t('切換 Java 執行版本')"
    :confirm-loading="isLoading"
    :ok-text="t('確認修改')"
    :cancel-text="t('取消')"
    @ok="submit"
  >
    <div class="java-switch-container">
      <a-alert type="warning" show-icon style="margin-bottom: 20px">
        <template #message>
          {{ t("操作須知") }}
        </template>
        <template #description>
          {{ t("此操作將修改實例的啟動指令，請確保伺服器目錄下存在對應的 .sh 腳本檔案。") }}
        </template>
      </a-alert>

      <div class="selection-area">
        <a-typography-title :level="5">
          {{ t("選擇 Java 版本") }}
        </a-typography-title>
        
        <a-radio-group v-model:value="selectedJava" button-style="solid" class="full-width-group">
          <a-radio-button 
            v-for="item in JAVA_VERSIONS" 
            :key="item.value" 
            :value="item.value"
            class="version-btn"
          >
            <check-outlined v-if="selectedJava === item.value" />
            {{ item.label }}
          </a-radio-button>
        </a-radio-group>
      </div>

      <div class="command-preview">
        <div class="preview-label">{{ t("預計執行的啟動指令：") }}</div>
        <div class="preview-content">
          <code>{{ JAVA_VERSIONS.find(v => v.value === selectedJava)?.script }}</code>
        </div>
      </div>
    </div>
  </a-modal>
</template>

<style scoped>
.java-switch-container {
  padding: 8px 0;
}

.full-width-group {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 8px;
  width: 100%;
}

.version-btn {
  text-align: center;
  border-radius: 4px !important;
  border-left-width: 1px !important;
}

.version-btn :deep(span) {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.command-preview {
  margin-top: 24px;
  padding: 16px;
  background-color: #fafafa;
  border: 1px dashed #d9d9d9;
  border-radius: 8px;
}

.preview-label {
  font-size: 13px;
  color: #8c8c8c;
  margin-bottom: 8px;
}

.preview-content {
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
  font-weight: 600;
  color: #1890ff;
  font-size: 15px;
}
</style>
