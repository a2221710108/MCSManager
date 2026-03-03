<script setup lang="ts">
import { ref } from "vue";
import { t } from "@/lang/i18n";
import { message } from "ant-design-vue";
import { reportErrorMsg } from "@/tools/validator";
// 使用你 instance.ts 裡定義好的更新配置接口
import { updateInstanceConfig } from "@/services/apis/instance";

const props = defineProps<{
  instanceId?: string;
  daemonId?: string;
}>();

const emit = defineEmits(["update"]);
const open = ref(false);

// 使用標準的 API Hook
const { execute, isLoading } = updateInstanceConfig();

const openDialog = () => {
  open.value = true;
};

const submitJavaSwitch = async (command: string, label: string) => {
  if (!props.instanceId || !props.daemonId) return;

  try {
    // 直接調用實例配置更新接口
    // 這會觸發 Daemon 端的 instance.parameters() 方法
    await execute({
      params: {
        uuid: props.instanceId,
        daemonId: props.daemonId
      },
      data: {
        // 直接指定要修改的欄位，這符合你 instance.ts 中的邏輯
        // configureEntityParams(this.config, cfg, "startCommand", String);
        startCommand: command 
      }
    });
    
    message.success(`${t("成功切換至")} ${label}`);
    open.value = false;
    emit("update");
  } catch (error: any) {
    // 如果報錯 "只有停止狀態能修改"，說明後端 parameters() 裡的邏輯生效了
    reportErrorMsg(error);
  }
};

defineExpose({ openDialog });
</script>

<template>
  <a-modal 
    v-model:open="open" 
    :title="t('一鍵切換 Java 版本')" 
    :footer="null"
    :destroy-on-close="true"
  >
    <div class="java-switch-wrapper">
      <a-alert 
        :message="t('注意')" 
        :description="t('請確保伺服器已停止，否則修改將無法生效。')" 
        type="warning" 
        show-icon 
        class="mb-4"
      />
      
      <div class="flex-column">
        <a-button 
          class="switch-btn"
          type="primary" 
          ghost 
          block 
          :loading="isLoading" 
          @click="submitJavaSwitch('./start_8_mc.sh', 'Java 8')"
        >
          <template #icon><ThunderboltOutlined /></template>
          切換為 Java 8 (start_8_mc.sh)
        </a-button>

        <a-button 
          class="switch-btn"
          type="primary" 
          ghost 
          block 
          :loading="isLoading" 
          @click="submitJavaSwitch('./start_17_mc.sh', 'Java 17')"
        >
          切換為 Java 17 (start_17_mc.sh)
        </a-button>

        <a-button 
          class="switch-btn"
          type="primary" 
          ghost 
          block 
          :loading="isLoading" 
          @click="submitJavaSwitch('./start_21_mc.sh', 'Java 21')"
        >
          切換為 Java 21 (start_21_mc.sh)
        </a-button>
      </div>

      <p class="hint-text">
        {{ t('此操作會直接修改實例的「啟動指令」配置項。') }}
      </p>
    </div>
  </a-modal>
</template>

<style scoped>
.java-switch-wrapper {
  padding: 10px 0;
}
.flex-column {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.switch-btn {
  height: 45px;
  font-size: 15px;
  border-radius: 8px;
}
.mb-4 {
  margin-bottom: 20px;
}
.hint-text {
  margin-top: 15px;
  text-align: center;
  color: #888;
  font-size: 12px;
}
</style>
