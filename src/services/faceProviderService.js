const faceppService = require("./faceppService");
const PlatformSetting = require("../models/PlatformSetting");

const DEFAULT_FACEPP_BASE_URL = "https://api-us.faceplusplus.com/facepp/v3";
const PROVIDER_CATALOG = {
  facepp: {
    label: "Face++",
    implemented: true,
  },
  aws_rekognition: {
    label: "AWS Rekognition",
    implemented: false,
  },
  azure_face: {
    label: "Azure Face",
    implemented: false,
  },
  google_vision: {
    label: "Google Cloud Vision",
    implemented: false,
  },
};

function getMaskedSecret(value) {
  if (!value) return null;
  if (value.length <= 8) return "********";
  return `${value.slice(0, 4)}••••${value.slice(-2)}`;
}

async function getOrCreatePlatformSetting() {
  let platformSetting = await PlatformSetting.findOne({ key: "defaults" });
  if (!platformSetting) {
    platformSetting = await PlatformSetting.create({ key: "defaults" });
  }
  return platformSetting;
}

async function getBiometricSettings() {
  const platformSetting = await getOrCreatePlatformSetting();
  const biometrics = platformSetting.biometrics || {};
  const facepp = biometrics.providers?.facepp || {};
  const awsRekognition = biometrics.providers?.aws_rekognition || {};
  const azureFace = biometrics.providers?.azure_face || {};
  const googleVision = biometrics.providers?.google_vision || {};

  return {
    platformSetting,
    active_provider: biometrics.active_provider || "facepp",
    provider_catalog: PROVIDER_CATALOG,
    providers: {
      facepp: {
        enabled: facepp.enabled !== false,
        implemented: true,
        configured: Boolean(facepp.api_key && facepp.api_secret),
        api_key_masked: getMaskedSecret(facepp.api_key || ""),
        api_secret_masked: getMaskedSecret(facepp.api_secret || ""),
        base_url: facepp.base_url || DEFAULT_FACEPP_BASE_URL,
        confidence_threshold:
          typeof facepp.confidence_threshold === "number"
            ? facepp.confidence_threshold
            : Number(process.env.FACE_CONFIDENCE_THRESHOLD || 80),
      },
      aws_rekognition: {
        enabled: Boolean(awsRekognition.enabled),
        implemented: false,
        configured: Boolean(
          awsRekognition.access_key_id && awsRekognition.secret_access_key,
        ),
        access_key_id_masked: getMaskedSecret(awsRekognition.access_key_id || ""),
        secret_access_key_masked: getMaskedSecret(
          awsRekognition.secret_access_key || "",
        ),
        region: awsRekognition.region || "us-east-1",
        similarity_threshold:
          typeof awsRekognition.similarity_threshold === "number"
            ? awsRekognition.similarity_threshold
            : 90,
      },
      azure_face: {
        enabled: Boolean(azureFace.enabled),
        implemented: false,
        configured: Boolean(azureFace.endpoint && azureFace.api_key),
        endpoint: azureFace.endpoint || null,
        api_key_masked: getMaskedSecret(azureFace.api_key || ""),
        confidence_threshold:
          typeof azureFace.confidence_threshold === "number"
            ? azureFace.confidence_threshold
            : 80,
      },
      google_vision: {
        enabled: Boolean(googleVision.enabled),
        implemented: false,
        configured: Boolean(googleVision.project_id && googleVision.api_key),
        project_id: googleVision.project_id || null,
        api_key_masked: getMaskedSecret(googleVision.api_key || ""),
        confidence_threshold:
          typeof googleVision.confidence_threshold === "number"
            ? googleVision.confidence_threshold
            : 80,
      },
    },
  };
}

async function resolveProvider() {
  const biometrics = await getBiometricSettings();

  if (biometrics.active_provider !== "facepp") {
    return {
      provider: null,
      providerKey: biometrics.active_provider,
      status: {
        provider: biometrics.active_provider,
        configured: false,
        implemented: false,
        error: "Selected biometric provider is not implemented yet",
      },
    };
  }

  const provider = faceppService;
  provider.configure({
    api_key: biometrics.platformSetting?.biometrics?.providers?.facepp?.api_key,
    api_secret:
      biometrics.platformSetting?.biometrics?.providers?.facepp?.api_secret,
    base_url: biometrics.platformSetting?.biometrics?.providers?.facepp?.base_url,
    confidence_threshold:
      biometrics.platformSetting?.biometrics?.providers?.facepp?.confidence_threshold,
  });
  const providerStatus = provider.getStatus();
  return {
    provider,
    providerKey: "facepp",
    status: {
      provider: "facepp",
      implemented: true,
      configured: Boolean(providerStatus.configured),
      base_url: providerStatus.base_url || biometrics.providers.facepp.base_url,
      confidence_threshold:
        providerStatus.confidenceThreshold ||
        biometrics.providers.facepp.confidence_threshold,
    },
  };
}

class FaceProviderService {
  async getSettingsSummary() {
    return getBiometricSettings();
  }

  async getStatus() {
    const resolved = await resolveProvider();
    return resolved.status;
  }

  async validateConfig() {
    const resolved = await resolveProvider();
    if (!resolved.provider) {
      return {
        success: false,
        provider: resolved.providerKey,
        error: resolved.status.error || "Biometric provider unavailable",
      };
    }

    if (!resolved.status.configured) {
      return {
        success: false,
        provider: resolved.providerKey,
        error: "Biometric provider is not configured",
      };
    }

    return {
      success: true,
      provider: resolved.providerKey,
    };
  }

  async detectFace(imageUrl) {
    const config = await this.validateConfig();
    if (!config.success) {
      return {
        success: false,
        provider: config.provider,
        error: config.error,
        code: "BIOMETRIC_PROVIDER_NOT_CONFIGURED",
      };
    }

    const resolved = await resolveProvider();
    return resolved.provider.detectFace(imageUrl);
  }

  async compareFaces(faceToken, imageUrl) {
    const config = await this.validateConfig();
    if (!config.success) {
      return {
        success: false,
        provider: config.provider,
        error: config.error,
        code: "BIOMETRIC_PROVIDER_NOT_CONFIGURED",
      };
    }

    const resolved = await resolveProvider();
    return resolved.provider.compareFaces(faceToken, imageUrl);
  }

  async verifyFace(faceToken, imageUrl) {
    const config = await this.validateConfig();
    if (!config.success) {
      return {
        success: false,
        provider: config.provider,
        error: config.error,
        code: "BIOMETRIC_PROVIDER_NOT_CONFIGURED",
      };
    }

    const resolved = await resolveProvider();
    return resolved.provider.verifyFace(faceToken, imageUrl);
  }

  async testConnection(imageUrl) {
    const config = await this.validateConfig();
    if (!config.success) {
      return {
        success: false,
        provider: config.provider,
        error: config.error,
        code: "BIOMETRIC_PROVIDER_NOT_CONFIGURED",
      };
    }

    const resolved = await resolveProvider();
    const detection = await resolved.provider.detectFace(imageUrl);
    return {
      provider: resolved.providerKey,
      ...detection,
    };
  }
}

module.exports = new FaceProviderService();
