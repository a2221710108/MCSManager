<script setup lang="ts">
import { ref } from "vue";
import { t } from "@/lang/i18n";
import { message } from "ant-design-vue";
import { reportErrorMsg } from "@/tools/validator";
// 引入我們剛剛在 instance.ts 定義的 API
import { executeJavaSwitch } from "@/services/apis/instance";

const props = defineProps<{
  instanceId?: string;
  daemonId?: string;
}>();

const emit = defineEmits(["update"]);
const open = ref(false);

// 使用你專案標準的 useDefineApi Hook
const { execute, isLoading } = executeJavaSwitch();

const openDialog = () => {
  open.value = true;
};

const submitJavaSwitch = async (command: string, label: string) => {
  if (!props.instanceId || !props.daemonId) return;

  try {
    await execute({
      // 對應 params 部分 (URL 參數)
      params: {
        uuid: props.instanceId,
        daemonId: props.daemonId
      },
      // 對應 data 部分 (Body 數據)
      data: {
        command: "javaSwitch", // 必須是 'command' 欄位，這解決了你的驗證錯誤
        params: {
          startCommand: command
        }
      }
    });
    
    message.success(`${t("指令已發送：")} ${label}`);
    open.value = false;
    emit("update");
  } catch (error: any) {
    reportErrorMsg(error);
  }
};

defineExpose({ openDialog });
</script>

<template>
  <a-modal v-model:open="open" :title="t('一鍵切換 Java 版本')" :footer="null">
    <div style="display: flex; flex-direction: column; gap: 12px; padding: 10px 0;">
      <a-alert message="操作提醒" description="請先停止伺服器後再點擊切換。" type="info" show-icon />
      
      <a-button type="primary" ghost :loading="isLoading" block @click="submitJavaSwitch('./start_8_mc.sh', 'Java 8')">
        Java 8
      </a-button>
      <a-button type="primary" ghost :loading="isLoading" block @click="submitJavaSwitch('./start_17_mc.sh', 'Java 17')">
        Java 17
      </a-button>
      <a-button type="primary" ghost :loading="isLoading" block @click="submitJavaSwitch('./start_21_mc.sh', 'Java 21')">
        Java 21
      </a-button>
    </div>
  </a-modal>
</template>
