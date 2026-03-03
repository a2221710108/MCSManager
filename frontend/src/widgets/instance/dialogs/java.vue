<script setup lang="ts">
import { ref } from "vue";
import { t } from "@/lang/i18n";
import { message } from "ant-design-vue";
import { reportErrorMsg } from "@/tools/validator";
import { executeCustomCommand } from "@/services/apis/instance";

const props = defineProps<{
  instanceId?: string;
  daemonId?: string;
}>();

const emit = defineEmits(["update"]);
const open = ref(false);

// 使用剛剛定義的指令 API Hook
const { execute, isLoading } = executeCustomCommand();

const openDialog = () => { open.value = true; };

const submitJavaSwitch = async (command: string, label: string) => {
  if (!props.instanceId || !props.daemonId) return;

  try {
    await execute({
      params: {
        uuid: props.instanceId,
        daemonId: props.daemonId
      },
      data: {
        command: "javaSwitch", // 觸發後端的 JavaSwitchCommand
        params: {
          startCommand: command
        }
      }
    });
    
    message.success(`[${label}] ${t("環境切換成功")}`);
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
    <div style="display: flex; flex-direction: column; gap: 12px;">
      <a-button type="primary" ghost block :loading="isLoading" @click="submitJavaSwitch('./start_8_mc.sh', 'Java 8')">切換至 Java 8</a-button>
      <a-button type="primary" ghost block :loading="isLoading" @click="submitJavaSwitch('./start_17_mc.sh', 'Java 17')">切換至 Java 17</a-button>
      <a-button type="primary" ghost block :loading="isLoading" @click="submitJavaSwitch('./start_21_mc.sh', 'Java 21')">切換至 Java 21</a-button>
    </div>
  </a-modal>
</template>
