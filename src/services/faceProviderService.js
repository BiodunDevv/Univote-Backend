const axios = require("axios");
const {
  RekognitionClient,
  CreateCollectionCommand,
  CreateFaceLivenessSessionCommand,
  DeleteFacesCommand,
  DescribeCollectionCommand,
  DetectFacesCommand,
  GetFaceLivenessSessionResultsCommand,
  IndexFacesCommand,
  SearchFacesByImageCommand,
} = require("@aws-sdk/client-rekognition");
const PlatformSetting = require("../models/PlatformSetting");

const DEFAULT_AWS_REGION = "us-east-1";
const DEFAULT_COLLECTION_PREFIX = "univote-students";
const DEFAULT_SIMILARITY_THRESHOLD = 70;
const DEFAULT_LIVENESS_THRESHOLD = 70;

const PROVIDER_CATALOG = {
  aws_rekognition: {
    label: "AWS Rekognition",
    implemented: true,
    rollout_visible: true,
    description:
      "AWS Rekognition face collections with liveness support for university voting verification.",
    requirements: [
      "Access key ID",
      "Secret access key",
      "Region",
      "Similarity threshold",
    ],
  },
};

function getMaskedSecret(value) {
  if (!value) return null;
  if (value.length <= 8) return "********";
  return `${value.slice(0, 4)}••••${value.slice(-2)}`;
}

function getProviderDefaultState() {
  return {
    enabled: true,
    region: DEFAULT_AWS_REGION,
    access_key_id: null,
    secret_access_key: null,
    similarity_threshold: DEFAULT_SIMILARITY_THRESHOLD,
    collection_prefix: DEFAULT_COLLECTION_PREFIX,
    liveness_required: true,
    liveness_threshold: DEFAULT_LIVENESS_THRESHOLD,
  };
}

async function getOrCreatePlatformSetting() {
  let platformSetting = await PlatformSetting.findOne({ key: "defaults" });
  if (!platformSetting) {
    platformSetting = await PlatformSetting.create({ key: "defaults" });
  }
  return platformSetting;
}

function sanitizeCollectionSegment(value, fallback = "tenant") {
  return String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

function normalizeAwsError(error, fallbackCode = "AWS_BIOMETRIC_ERROR") {
  const name = error?.name || error?.Code || null;
  const message = error?.message || "AWS biometric request failed.";

  if (name === "InvalidImageFormatException") {
    return {
      success: false,
      error: "The uploaded image format is invalid.",
      code: "INVALID_IMAGE",
    };
  }

  if (name === "ImageTooLargeException") {
    return {
      success: false,
      error: "The uploaded image is too large for verification.",
      code: "INVALID_IMAGE",
    };
  }

  if (name === "InvalidParameterException") {
    return {
      success: false,
      error: "No face was detected in the supplied image.",
      code: "NO_FACE_DETECTED",
    };
  }

  if (name === "ProvisionedThroughputExceededException" || name === "ThrottlingException") {
    return {
      success: false,
      error: "AWS biometric service is busy. Please try again in a moment.",
      code: "AWS_BIOMETRIC_ERROR",
    };
  }

  return {
    success: false,
    error: message,
    code: fallbackCode,
  };
}

class FaceProviderService {
  async getBiometricSettings() {
    const platformSetting = await getOrCreatePlatformSetting();
    const awsProvider = platformSetting.biometrics?.providers?.aws_rekognition || {};

    const accessKeyId =
      awsProvider.access_key_id || process.env.AWS_ACCESS_KEY_ID || "";
    const secretAccessKey =
      awsProvider.secret_access_key || process.env.AWS_SECRET_ACCESS_KEY || "";
    const region = awsProvider.region || process.env.AWS_REGION || DEFAULT_AWS_REGION;
    const similarityThreshold =
      typeof awsProvider.similarity_threshold === "number"
        ? awsProvider.similarity_threshold
        : Number(process.env.AWS_REKOGNITION_SIMILARITY_THRESHOLD || DEFAULT_SIMILARITY_THRESHOLD);
    const collectionPrefix =
      awsProvider.collection_prefix ||
      process.env.AWS_REKOGNITION_COLLECTION_PREFIX ||
      DEFAULT_COLLECTION_PREFIX;
    const livenessRequired =
      typeof awsProvider.liveness_required === "boolean"
        ? awsProvider.liveness_required
        : String(process.env.AWS_REKOGNITION_LIVENESS_REQUIRED || "true") !== "false";
    const livenessThreshold =
      typeof awsProvider.liveness_threshold === "number"
        ? awsProvider.liveness_threshold
        : Number(process.env.AWS_REKOGNITION_LIVENESS_THRESHOLD || DEFAULT_LIVENESS_THRESHOLD);

    return {
      platformSetting,
      active_provider: "aws_rekognition",
      provider_catalog: PROVIDER_CATALOG,
      providers: {
        aws_rekognition: {
          enabled: awsProvider.enabled !== false,
          implemented: true,
          configured: Boolean(accessKeyId && secretAccessKey && region),
          access_key_id_value: accessKeyId,
          secret_access_key_value: secretAccessKey,
          access_key_id_masked: getMaskedSecret(accessKeyId),
          secret_access_key_masked: getMaskedSecret(secretAccessKey),
          region,
          similarity_threshold: similarityThreshold,
          collection_prefix: collectionPrefix,
          liveness_required: livenessRequired,
          liveness_threshold: livenessThreshold,
        },
      },
    };
  }

  async buildClient() {
    const settings = await this.getBiometricSettings();
    const aws = settings.providers.aws_rekognition;

    return {
      settings,
      aws,
      client: new RekognitionClient({
        region: aws.region,
        credentials: {
          accessKeyId: aws.access_key_id_value,
          secretAccessKey: aws.secret_access_key_value,
        },
      }),
    };
  }

  getProviderCatalog() {
    return PROVIDER_CATALOG;
  }

  getProviderDefaultState(providerKey) {
    return providerKey === "aws_rekognition" ? getProviderDefaultState() : null;
  }

  async getSettingsSummary() {
    return this.getBiometricSettings();
  }

  async getStatus(providerKey = null) {
    if (providerKey && providerKey !== "aws_rekognition") {
      return {
        provider: providerKey,
        configured: false,
        implemented: false,
        error: "Only AWS Rekognition is supported.",
      };
    }

    const settings = await this.getBiometricSettings();
    const aws = settings.providers.aws_rekognition;

    return {
      provider: "aws_rekognition",
      implemented: true,
      configured: aws.configured,
      enabled: aws.enabled,
      region: aws.region,
      similarity_threshold: aws.similarity_threshold,
      collection_prefix: aws.collection_prefix,
      liveness_required: aws.liveness_required,
      liveness_threshold: aws.liveness_threshold,
    };
  }

  async validateConfig(providerKey = null) {
    const status = await this.getStatus(providerKey);

    if (providerKey && providerKey !== "aws_rekognition") {
      return {
        success: false,
        provider: providerKey,
        error: "Only AWS Rekognition is supported.",
      };
    }

    if (!status.configured) {
      return {
        success: false,
        provider: "aws_rekognition",
        error: "AWS Rekognition is not configured.",
      };
    }

    return {
      success: true,
      provider: "aws_rekognition",
    };
  }

  getCollectionId(tenant, awsSettings) {
    const prefix = sanitizeCollectionSegment(
      awsSettings.collection_prefix,
      DEFAULT_COLLECTION_PREFIX,
    );
    const tenantKey = sanitizeCollectionSegment(
      tenant?.slug || tenant?._id || tenant?.id,
      "tenant",
    );

    return `${prefix}-${tenantKey}`.slice(0, 255);
  }

  async ensureCollection(client, collectionId) {
    try {
      await client.send(
        new DescribeCollectionCommand({ CollectionId: collectionId }),
      );
      return collectionId;
    } catch (error) {
      if (error?.name !== "ResourceNotFoundException") {
        throw error;
      }
    }

    await client.send(new CreateCollectionCommand({ CollectionId: collectionId }));
    return collectionId;
  }

  async fetchImageBytes(imageUrl) {
    const response = await axios.get(imageUrl, {
      responseType: "arraybuffer",
      timeout: 30000,
    });

    return Buffer.from(response.data);
  }

  mapDetectResponse(faceDetails = []) {
    if (!Array.isArray(faceDetails) || faceDetails.length === 0) {
      return {
        success: false,
        error: "No face detected. Please upload a clear facial photo.",
        code: "NO_FACE_DETECTED",
      };
    }

    if (faceDetails.length > 1) {
      return {
        success: false,
        error: "Multiple faces detected. Please submit a single-person photo.",
        code: "MULTIPLE_FACES",
      };
    }

    const [face] = faceDetails;
    const brightness = face.Quality?.Brightness ?? null;
    const sharpness = face.Quality?.Sharpness ?? null;

    if (
      (typeof brightness === "number" && brightness < 25) ||
      (typeof sharpness === "number" && sharpness < 25)
    ) {
      return {
        success: false,
        error: "The photo quality is too low for facial verification.",
        code: "LOW_QUALITY_IMAGE",
      };
    }

    return {
      success: true,
      face_count: 1,
      face_details: face,
      quality: {
        brightness,
        sharpness,
      },
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

    try {
      const { client } = await this.buildClient();
      const imageBytes = await this.fetchImageBytes(imageUrl);
      const response = await client.send(
        new DetectFacesCommand({
          Image: { Bytes: imageBytes },
          Attributes: ["ALL"],
        }),
      );

      return {
        provider: "aws_rekognition",
        ...this.mapDetectResponse(response.FaceDetails || []),
      };
    } catch (error) {
      return {
        provider: "aws_rekognition",
        ...normalizeAwsError(error),
      };
    }
  }

  async indexStudentFace(photoUrl, tenant, student) {
    const config = await this.validateConfig();
    if (!config.success) {
      return {
        success: false,
        provider: config.provider,
        error: config.error,
        code: "BIOMETRIC_PROVIDER_NOT_CONFIGURED",
      };
    }

    if (!photoUrl) {
      return {
        success: false,
        provider: "aws_rekognition",
        error: "Photo URL is required for biometric enrollment.",
        code: "INVALID_IMAGE",
      };
    }

    try {
      const { client, aws } = await this.buildClient();
      const collectionId = this.getCollectionId(tenant, aws);
      await this.ensureCollection(client, collectionId);

      if (student?.aws_face_id && student?.aws_face_collection_id) {
        try {
          await client.send(
            new DeleteFacesCommand({
              CollectionId: student.aws_face_collection_id,
              FaceIds: [student.aws_face_id],
            }),
          );
        } catch (error) {
          console.warn("Failed to delete existing AWS face before reindex:", error.message);
        }
      }

      const imageBytes = await this.fetchImageBytes(photoUrl);
      const response = await client.send(
        new IndexFacesCommand({
          CollectionId: collectionId,
          Image: { Bytes: imageBytes },
          ExternalImageId: String(student?._id || student?.matric_no || Date.now()),
          DetectionAttributes: [],
          MaxFaces: 1,
          QualityFilter: "AUTO",
        }),
      );

      const record = response.FaceRecords?.[0] || null;
      if (!record?.Face?.FaceId) {
        const reasons = (response.UnindexedFaces || [])
          .flatMap((item) => item.Reasons || [])
          .filter(Boolean);

        if (reasons.includes("MULTIPLE_FACES")) {
          return {
            success: false,
            provider: "aws_rekognition",
            error: "Multiple faces detected. Please submit a single-person photo.",
            code: "MULTIPLE_FACES",
          };
        }

        if (reasons.includes("LOW_BRIGHTNESS") || reasons.includes("LOW_SHARPNESS")) {
          return {
            success: false,
            provider: "aws_rekognition",
            error: "The photo quality is too low for facial verification.",
            code: "LOW_QUALITY_IMAGE",
          };
        }

        return {
          success: false,
          provider: "aws_rekognition",
          error: "No face was indexed from the supplied photo.",
          code: "NO_FACE_DETECTED",
        };
      }

      return {
        success: true,
        provider: "aws_rekognition",
        aws_face_id: record.Face.FaceId,
        aws_face_image_id: record.Face.ImageId || null,
        aws_face_collection_id: collectionId,
        enrolled_at: new Date(),
      };
    } catch (error) {
      return {
        provider: "aws_rekognition",
        ...normalizeAwsError(error),
      };
    }
  }

  async deleteStudentFace(student) {
    if (!student?.aws_face_id || !student?.aws_face_collection_id) {
      return {
        success: true,
        provider: "aws_rekognition",
        deleted: false,
      };
    }

    const config = await this.validateConfig();
    if (!config.success) {
      return {
        success: false,
        provider: config.provider,
        error: config.error,
        code: "BIOMETRIC_PROVIDER_NOT_CONFIGURED",
      };
    }

    try {
      const { client } = await this.buildClient();
      await client.send(
        new DeleteFacesCommand({
          CollectionId: student.aws_face_collection_id,
          FaceIds: [student.aws_face_id],
        }),
      );

      return {
        success: true,
        provider: "aws_rekognition",
        deleted: true,
      };
    } catch (error) {
      if (error?.name === "ResourceNotFoundException") {
        return {
          success: true,
          provider: "aws_rekognition",
          deleted: false,
        };
      }

      return {
        provider: "aws_rekognition",
        ...normalizeAwsError(error),
      };
    }
  }

  async compareFaces(student, imageUrl, options = {}) {
    return this.verifyFace(student, imageUrl, options);
  }

  async verifyFaceBytes(student, imageBytes, options = {}) {
    const config = await this.validateConfig();
    if (!config.success) {
      return {
        success: false,
        provider: config.provider,
        error: config.error,
        code: "BIOMETRIC_PROVIDER_NOT_CONFIGURED",
      };
    }

    if (!student?.aws_face_id || !student?.aws_face_collection_id) {
      return {
        success: false,
        provider: "aws_rekognition",
        error:
          "No enrolled face was found for this student. Please contact your administrator.",
        code: "NO_REGISTERED_FACE",
      };
    }

    const normalizedImageBytes =
      imageBytes instanceof Uint8Array ? Buffer.from(imageBytes) : imageBytes;

    if (
      !normalizedImageBytes ||
      !Buffer.isBuffer(normalizedImageBytes) ||
      normalizedImageBytes.length === 0
    ) {
      return {
        success: false,
        provider: "aws_rekognition",
        error: "No facial reference image was captured for verification.",
        code: "INVALID_IMAGE",
      };
    }

    const threshold =
      typeof options.threshold_override === "number"
        ? Number(options.threshold_override)
        : DEFAULT_SIMILARITY_THRESHOLD;

    try {
      const { client } = await this.buildClient();
      const detectResponse = await client.send(
        new DetectFacesCommand({
          Image: { Bytes: normalizedImageBytes },
          Attributes: ["ALL"],
        }),
      );
      const detection = this.mapDetectResponse(detectResponse.FaceDetails || []);
      if (!detection.success) {
        return {
          provider: "aws_rekognition",
          ...detection,
        };
      }

      const response = await client.send(
        new SearchFacesByImageCommand({
          CollectionId: student.aws_face_collection_id,
          Image: { Bytes: normalizedImageBytes },
          FaceMatchThreshold: threshold,
          MaxFaces: 3,
        }),
      );

      const topMatch = (response.FaceMatches || [])[0] || null;
      const similarity = Number(topMatch?.Similarity || 0);
      const matchedFaceId = topMatch?.Face?.FaceId || null;
      const isMatch =
        matchedFaceId === student.aws_face_id && similarity >= threshold;

      return {
        success: true,
        provider: "aws_rekognition",
        confidence: similarity,
        is_match: isMatch,
        threshold,
        matched_face_id: matchedFaceId,
        face_image_id: topMatch?.Face?.ImageId || null,
        message: isMatch
          ? "Face verified successfully."
          : `Face match confidence was below the required threshold (${similarity.toFixed(2)}%).`,
      };
    } catch (error) {
      return {
        provider: "aws_rekognition",
        ...normalizeAwsError(error),
      };
    }
  }

  async verifyFace(student, imageUrl, options = {}) {
    const config = await this.validateConfig();
    if (!config.success) {
      return {
        success: false,
        provider: config.provider,
        error: config.error,
        code: "BIOMETRIC_PROVIDER_NOT_CONFIGURED",
      };
    }

    if (!student?.aws_face_id || !student?.aws_face_collection_id) {
      return {
        success: false,
        provider: "aws_rekognition",
        error:
          "No enrolled face was found for this student. Please contact your administrator.",
        code: "NO_REGISTERED_FACE",
      };
    }

    const threshold =
      typeof options.threshold_override === "number"
        ? Number(options.threshold_override)
        : DEFAULT_SIMILARITY_THRESHOLD;

    const detection = await this.detectFace(imageUrl);
    if (!detection.success) {
      return detection;
    }

    try {
      const { client } = await this.buildClient();
      const imageBytes = await this.fetchImageBytes(imageUrl);
      const response = await client.send(
        new SearchFacesByImageCommand({
          CollectionId: student.aws_face_collection_id,
          Image: { Bytes: imageBytes },
          FaceMatchThreshold: threshold,
          MaxFaces: 3,
        }),
      );

      const topMatch = (response.FaceMatches || [])[0] || null;
      const similarity = Number(topMatch?.Similarity || 0);
      const matchedFaceId = topMatch?.Face?.FaceId || null;
      const isMatch =
        matchedFaceId === student.aws_face_id && similarity >= threshold;

      return {
        success: true,
        provider: "aws_rekognition",
        confidence: similarity,
        is_match: isMatch,
        threshold,
        matched_face_id: matchedFaceId,
        face_image_id: topMatch?.Face?.ImageId || null,
        message: isMatch
          ? "Face verified successfully."
          : `Face match confidence was below the required threshold (${similarity.toFixed(2)}%).`,
      };
    } catch (error) {
      return {
        provider: "aws_rekognition",
        ...normalizeAwsError(error),
      };
    }
  }

  async createLivenessSession() {
    const config = await this.validateConfig();
    if (!config.success) {
      return {
        success: false,
        provider: config.provider,
        error: config.error,
        code: "BIOMETRIC_PROVIDER_NOT_CONFIGURED",
      };
    }

    try {
      const { client } = await this.buildClient();
      const response = await client.send(
        new CreateFaceLivenessSessionCommand({}),
      );

      return {
        success: true,
        provider: "aws_rekognition",
        session_id: response.SessionId,
      };
    } catch (error) {
      return {
        provider: "aws_rekognition",
        ...normalizeAwsError(error),
      };
    }
  }

  async getLivenessResult(sessionId) {
    const config = await this.validateConfig();
    if (!config.success) {
      return {
        success: false,
        provider: config.provider,
        error: config.error,
        code: "BIOMETRIC_PROVIDER_NOT_CONFIGURED",
      };
    }

    try {
      const { client, aws } = await this.buildClient();
      const response = await client.send(
        new GetFaceLivenessSessionResultsCommand({
          SessionId: sessionId,
        }),
      );

      const confidence = Number(response.Confidence || 0);
      const passed = confidence >= Number(aws.liveness_threshold || DEFAULT_LIVENESS_THRESHOLD);

      return {
        success: true,
        provider: "aws_rekognition",
        confidence,
        passed,
        status: response.Status || null,
        threshold: Number(aws.liveness_threshold || DEFAULT_LIVENESS_THRESHOLD),
        reference_image:
          response.ReferenceImage?.Bytes ||
          response.AuditImages?.[0]?.Bytes ||
          null,
      };
    } catch (error) {
      return {
        provider: "aws_rekognition",
        ...normalizeAwsError(error, "LIVENESS_FAILED"),
      };
    }
  }

  async testConnection(imageUrl) {
    return this.testConnectionForProvider("aws_rekognition", imageUrl);
  }

  async testConnectionForProvider(providerKey, imageUrl) {
    const config = await this.validateConfig(providerKey);
    if (!config.success) {
      return {
        success: false,
        provider: config.provider,
        error: config.error,
        code: "BIOMETRIC_PROVIDER_NOT_CONFIGURED",
        readiness: {
          implemented: providerKey === "aws_rekognition",
          requirements: providerKey === "aws_rekognition"
            ? PROVIDER_CATALOG.aws_rekognition.requirements
            : undefined,
        },
      };
    }

    if (!imageUrl) {
      return {
        success: true,
        provider: "aws_rekognition",
        readiness: {
          implemented: true,
          configured: true,
        },
      };
    }

    const detection = await this.detectFace(imageUrl);
    return {
      provider: "aws_rekognition",
      readiness: {
        implemented: true,
        configured: true,
      },
      ...detection,
    };
  }
}

module.exports = new FaceProviderService();
