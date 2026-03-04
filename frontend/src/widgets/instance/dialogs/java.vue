<script setup lang="ts">
import { useAppRouters } from "@/hooks/useAppRouters";
import { useScreen } from "@/hooks/useScreen";
import { t } from "@/lang/i18n";
import { updateAnyInstanceConfig } from "@/services/apis/instance";
import { reportErrorMsg } from "@/tools/validator";
import type { InstanceDetail } from "@/types";
import { message } from "ant-design-vue";
import { computed, ref } from "vue";

const props = defineProps<{
  instanceInfo?: InstanceDetail;
  instanceId?: string;
  daemonId?: string;
}>();

const emit = defineEmits(["update"]);

const open = ref(false);
const selectedJavaVersion = ref<string>();
const screen = useScreen();
const isPhone = computed(() => screen.isPhone.value);
const { execute, isLoading } = updateAnyInstanceConfig();

// Java 版本與啟動指令的映射表
const JAVA_COMMAND_MAP: Record<string, string> = {
  "6": "./start_6_mc.sh",
  "8": "./start_8_mc.sh",
  "17": "./start_17_mc.sh",
  "21": "./start_21_mc.sh",
  "25": "./start_25_mc.sh"
};

const openDialog = () => {
  if (!props.instanceInfo) return;
  open.value = true;
  
  // 根據目前的啟動指令反推選中的 Java 版本（初始化）
  const currentCmd = props.instanceInfo.config.startCommand;
  const version = Object.keys(JAVA_COMMAND_MAP).find(
    (key) => JAVA_COMMAND_MAP[key] === currentCmd
  );
  selectedJavaVersion.value = version;
};

const submit = async () => {
  try {
    if (!props.instanceInfo) return;

    // 1. 核心安全檢查：伺服器必須是關閉狀態 (假設 0 為已停止)
    // 注意：具體狀態碼需根據您的後端定義調整，通常 MCSM 0 為停止
    if (props.instanceInfo.status !== 0) {
      return message.error("伺服器運行中，請先關閉伺服器後再切換 Java 版本！");
    }

    if (!selectedJavaVersion.value) {
      return message.warning("請選擇一個 Java 版本");
    }

    const newCommand = JAVA_COMMAND_MAP[selectedJavaVersion.value];

    // 2. 構建提交數據：只修改啟動指令
    await execute({
      params: {
        uuid: props.instanceId ?? "",
        daemonId: props.daemonId ?? ""
      },
      data: {
        ...props.instanceInfo.config,
        startCommand: newCommand
      }
    });

    message.success(`成功切換至 Java ${selectedJavaVersion.value}`);
    emit("update");
    open.value = false;
  } catch (error: any) {
    console.error(error);
    return reportErrorMsg(error.message || "修改失敗");
  }
};

defineExpose({ openDialog });
</script>

<template>
  <a-modal
    v-model:open="open"
    centered
    :mask-closable="false"
    :width="isPhone ? '95%' : '500px'"
    title="快速切換 Java 版本"
    :confirm-loading="isLoading"
    @ok="submit"
  >
    <div class="py-4">
      <a-alert
        v-if="instanceInfo?.status !== 0"
        message="警告"
        description="偵測到實例正在運行，請停機後操作。"
        type="error"
        show-icon
        class="mb-4"
      />
      
      <a-typography-paragraph>
        <a-typography-text type="secondary">
          選擇 Java 版本後，系統將自動將啟動指令更換為對應的腳本（如 ./start_x_mc.sh）。
        </a-typography-text>
      </a-typography-paragraph>

      <a-form layout="vertical">
        <a-form-item label="選擇 Java 版本" required>
          <a-select
            v-model:value="selectedJavaVersion"
            placeholder="請選擇版本"
            size="large"
            :disabled="instanceInfo?.status !== 0"
          >
            <a-select-option v-for="v in ['6', '8', '17', '21', '25']" :key="v" :value="v">
              Java {{ v }}
            </a-select-option>
          </a-select>
        </a-form-item>
        
        <div v-if="selectedJavaVersion" class="mt-2">
          <a-typography-text type="secondary">
            預計修改為指令：
            <code class="bg-gray-100 px-2 py-1 rounded">{{ JAVA_COMMAND_MAP[selectedJavaVersion] }}</code>
          </a-typography-text>
        </div>
      </a-form>
    </div>
  </a-modal>
</template>

<style scoped>
.py-4 { padding-top: 1rem; padding-bottom: 1rem; }
.mb-4 { margin-bottom: 1rem; }
.mt-2 { margin-top: 0.5rem; }
.bg-gray-100 { background-color: #f3f4f6; }
</style>
