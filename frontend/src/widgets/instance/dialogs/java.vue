<script setup lang="ts">
import { useAppRouters } from "@/hooks/useAppRouters";
import { t } from "@/lang/i18n";
import { updateAnyInstanceConfig } from "@/services/apis/instance";
import { reportErrorMsg } from "@/tools/validator";
import type { InstanceDetail } from "@/types";
import { CheckOutlined } from "@ant-design/icons-vue";
import { message } from "ant-design-vue";
import { computed, ref } from "vue";

const props = defineProps<{
  instanceInfo?: InstanceDetail;
  instanceId?: string;
  daemonId?: string;
}>();

const emit = defineEmits(["update"]);

// 定義 Java 版本與對應指令
const JAVA_VERSIONS = [
  { label: "Java 6", value: "6", script: "./start_6_mc.sh" },
  { label: "Java 8", value: "8", script: "./newstart_8_mc.sh" },
  { label: "Java 17", value: "17", script: "./newstart_17_mc.sh" },
  { label: "Java 21", value: "21", script: "./newstart_21_mc.sh" },
  { label: "Java 21 Forge/Neoforge", value: "21", script: "./newstart_21_newforge.sh" },
  { label: "Java 25", value: "25", script: "./start_25_mc.sh" }
];

const open = ref(false);
const selectedJava = ref<string>("17");
const { execute, isLoading } = updateAnyInstanceConfig();

// 初始化，根據目前的 startCommand 匹配選擇的版本
const initSelection = () => {
  const currentCmd = props.instanceInfo?.config?.startCommand || "";
  const found = JAVA_VERSIONS.find(v => currentCmd.includes(v.script));
  selectedJava.value = found ? found.value : "17";
};

const openDialog = () => {
  // 檢查伺服器是否已關閉 (假設 0 為 Stopped)
  // 注意：這裡的狀態碼請根據你實際的後端定義調整，通常 0 是停止，其他是執行中
  if (props.instanceInfo?.status !== 0) {
    return message.error("必須先關閉伺服器才能修改 Java 版本！");
  }
  initSelection();
  open.value = true;
};

const submit = async () => {
  try {
    const targetVersion = JAVA_VERSIONS.find(v => v.value === selectedJava.value);
    if (!targetVersion) return;

    await execute({
      params: {
        uuid: props.instanceId ?? "",
        daemonId: props.daemonId ?? ""
      },
      data: {
        // 只更新啟動指令
        startCommand: targetVersion.script
      }
    });

    message.success(`成功切換至 ${targetVersion.label}`);
    emit("update");
    open.value = false;
  } catch (error: any) {
    return reportErrorMsg(error.message || "修改失敗");
  }
};

defineExpose({ openDialog });
</script>

<template>
  <a-modal
    v-model:open="open"
    centered
    :title="t('切換 Java 執行版本')"
    :confirm-loading="isLoading"
    @ok="submit"
  >
    <div class="java-switch-container">
      <a-alert 
        type="info" 
        show-icon 
        style="margin-bottom: 20px;"
        message="切換版本將會更改伺服器的啟動指令腳本。"
      />

      <a-form layout="vertical">
        <a-form-item label="選擇 Java 版本">
          <a-radio-group v-model:value="selectedJava" button-style="solid" class="full-width-group">
            <a-radio-button 
              v-for="item in JAVA_VERSIONS" 
              :key="item.value" 
              :value="item.value"
              class="java-radio-btn"
            >
              <template v-if="selectedJava === item.value">
                <check-outlined />
              </template>
              {{ item.label }}
            </a-radio-button>
          </a-radio-group>
        </a-form-item>

        <div class="preview-box">
          <span class="label">預覽啟動指令：</span>
          <code class="command-code">
            {{ JAVA_VERSIONS.find(v => v.value === selectedJava)?.script }}
          </code>
        </div>
      </a-form>
    </div>
  </a-modal>
</template>

<style scoped>
.java-switch-container {
  padding: 10px 0;
}

.full-width-group {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.java-radio-btn {
  flex: 1;
  text-align: center;
  min-width: 100px;
  border-radius: 4px !important;
}

.preview-box {
  margin-top: 24px;
  padding: 12px;
  background-color: #f5f5f5;
  border-radius: 6px;
  border-left: 4px solid #1890ff;
}

.preview-box .label {
  display: block;
  font-size: 12px;
  color: #666;
  margin-bottom: 4px;
}

.command-code {
  font-family: monospace;
  font-weight: bold;
  color: #333;
}
</style>
