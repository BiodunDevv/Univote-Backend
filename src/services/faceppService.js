const axios = require("axios");

const FACEPP_API_KEY = process.env.FACEPP_API_KEY;
const FACEPP_API_SECRET = process.env.FACEPP_API_SECRET;
const FACEPP_BASE_URL = "https://api-us.faceplusplus.com/facepp/v3";
const FACE_CONFIDENCE_THRESHOLD = parseFloat(
  process.env.FACE_CONFIDENCE_THRESHOLD || 80
);

/**
 * Face++ API Service
 * Handles face detection and comparison for student enrollment and voting verification
 */
class FacePPService {
  constructor() {
    this.apiKey = FACEPP_API_KEY;
    this.apiSecret = FACEPP_API_SECRET;
    this.baseUrl = FACEPP_BASE_URL;
    this.confidenceThreshold = FACE_CONFIDENCE_THRESHOLD;
  }

  /**
   * Detect face in an image and return face_token
   * @param {string} imageUrl - URL of the image
   * @returns {Object} Face detection result with face_token
   */
  async detectFace(imageUrl) {
    try {
      if (!this.apiKey || !this.apiSecret) {
        return {
          success: false,
          error: "Face++ API credentials not configured",
        };
      }

      const response = await this._retryWithBackoff(async () => {
        return await axios.post(`${this.baseUrl}/detect`, null, {
          params: {
            api_key: this.apiKey,
            api_secret: this.apiSecret,
            image_url: imageUrl,
            return_landmark: 0,
            return_attributes: "none",
          },
          timeout: 30000, // 30 second timeout
        });
      });

      if (
        !response.data ||
        !response.data.faces ||
        response.data.faces.length === 0
      ) {
        return {
          success: false,
          error: "No face detected. Please upload a clear facial photo.",
        };
      }

      if (response.data.faces.length > 1) {
        return {
          success: false,
          error:
            "Multiple faces detected. Please submit a single-person photo.",
        };
      }

      const face = response.data.faces[0];

      return {
        success: true,
        face_token: face.face_token,
        face_rectangle: face.face_rectangle,
        image_id: response.data.image_id,
      };
    } catch (error) {
      console.error(
        "Face++ Detection Error:",
        error.response?.data || error.message
      );

      // Handle specific error cases
      if (error.response?.data?.error_message === "CONCURRENCY_LIMIT_EXCEEDED") {
        return {
          success: false,
          error:
            "Face++ API is currently busy. Please try again in a few seconds.",
          code: "CONCURRENCY_LIMIT_EXCEEDED",
        };
      }

      if (error.response?.data?.error_message === "RATE_LIMIT_EXCEEDED") {
        return {
          success: false,
          error: "Too many requests. Please wait a moment and try again.",
          code: "RATE_LIMIT_EXCEEDED",
        };
      }

      if (error.response?.data) {
        return {
          success: false,
          error:
            error.response.data.error_message ||
            "Face detection failed. Please try again.",
        };
      }

      return {
        success: false,
        error: "Face detection failed. Please try again with a clearer image.",
      };
    }
  }

  /**
   * Retry helper with exponential backoff for rate limiting
   * @private
   */
  async _retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        const isConcurrencyError =
          error.response?.data?.error_message === "CONCURRENCY_LIMIT_EXCEEDED";
        const isRateLimitError =
          error.response?.data?.error_message === "RATE_LIMIT_EXCEEDED";

        // Only retry on rate limit errors
        if ((isConcurrencyError || isRateLimitError) && attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt); // Exponential backoff
          console.log(
            `Face++ rate limit hit. Retrying in ${delay}ms... (Attempt ${
              attempt + 1
            }/${maxRetries})`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        throw error;
      }
    }
  }

  /**
   * Compare two faces using face tokens or image URLs
   * @param {string} faceToken1 - Face token from database (registered student face)
   * @param {string} imageUrl2 - URL of new image to compare (voting selfie)
   * @returns {Object} Comparison result with confidence score
   */
  async compareFaces(faceToken1, imageUrl2) {
    try {
      if (!this.apiKey || !this.apiSecret) {
        return {
          success: false,
          error: "Face++ API credentials not configured",
        };
      }

      // First, detect face in the new image to get its face_token
      const detection = await this.detectFace(imageUrl2);

      if (!detection.success) {
        return detection; // Return the detection error
      }

      const faceToken2 = detection.face_token;

      // Small delay before comparison to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Now compare the two face tokens with retry logic
      const response = await this._retryWithBackoff(async () => {
        return await axios.post(`${this.baseUrl}/compare`, null, {
          params: {
            api_key: this.apiKey,
            api_secret: this.apiSecret,
            face_token1: faceToken1,
            face_token2: faceToken2,
          },
          timeout: 30000,
        });
      });

      if (!response.data) {
        return {
          success: false,
          error: "Face comparison failed. Please try again.",
        };
      }

      const confidence = response.data.confidence || 0;
      const threshold =
        response.data.thresholds?.["1e-5"] || this.confidenceThreshold;

      return {
        success: true,
        confidence: confidence,
        is_match: confidence >= this.confidenceThreshold,
        threshold: this.confidenceThreshold,
        face_token2: faceToken2,
        message:
          confidence >= this.confidenceThreshold
            ? "Face verified successfully"
            : `Face not matched (confidence: ${confidence.toFixed(
                2
              )}%). Please retry with a clearer photo.`,
      };
    } catch (error) {
      console.error(
        "Face++ Comparison Error:",
        error.response?.data || error.message
      );

      // Handle specific error cases
      if (error.response?.data?.error_message === "CONCURRENCY_LIMIT_EXCEEDED") {
        return {
          success: false,
          error:
            "Face++ API is currently busy. Please try again in a few seconds.",
          code: "CONCURRENCY_LIMIT_EXCEEDED",
        };
      }

      if (error.response?.data?.error_message === "RATE_LIMIT_EXCEEDED") {
        return {
          success: false,
          error: "Too many requests. Please wait a moment and try again.",
          code: "RATE_LIMIT_EXCEEDED",
        };
      }

      if (error.response?.data) {
        return {
          success: false,
          error:
            error.response.data.error_message ||
            "Face comparison failed. Please try again.",
        };
      }

      return {
        success: false,
        error: "Face comparison failed. Please try again.",
      };
    }
  }

  /**
   * Verify if a new face image matches the registered face token
   * This is an alias for compareFaces with clearer naming for verification context
   * @param {string} registeredFaceToken - Face token from student database
   * @param {string} newImageUrl - URL of image to verify
   * @returns {Object} Verification result
   */
  async verifyFace(registeredFaceToken, newImageUrl) {
    return await this.compareFaces(registeredFaceToken, newImageUrl);
  }

  /**
   * Batch detect faces for multiple students
   * Useful for bulk student upload
   * @param {Array} imageUrls - Array of image URLs
   * @returns {Array} Array of detection results
   */
  async batchDetectFaces(imageUrls) {
    const results = [];

    for (const imageUrl of imageUrls) {
      const result = await this.detectFace(imageUrl);
      results.push({
        image_url: imageUrl,
        ...result,
      });

      // Add small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return results;
  }

  /**
   * Check for duplicate faces by comparing against multiple registered faces
   * @param {string} newImageUrl - URL of new image to check
   * @param {Array} registeredFaceTokens - Array of face tokens to check against
   * @returns {Object} Duplicate check result
   */
  async checkDuplicateFace(newImageUrl, registeredFaceTokens) {
    try {
      // First detect face in new image
      const detection = await this.detectFace(newImageUrl);

      if (!detection.success) {
        return detection;
      }

      const newFaceToken = detection.face_token;
      let highestConfidence = 0;
      let matchedToken = null;

      // Compare against all registered faces
      for (const registeredToken of registeredFaceTokens) {
        try {
          const response = await axios.post(`${this.baseUrl}/compare`, null, {
            params: {
              api_key: this.apiKey,
              api_secret: this.apiSecret,
              face_token1: registeredToken,
              face_token2: newFaceToken,
            },
            timeout: 30000,
          });

          const confidence = response.data.confidence || 0;

          if (confidence > highestConfidence) {
            highestConfidence = confidence;
            matchedToken = registeredToken;
          }

          // Add small delay to avoid rate limiting
          await new Promise((resolve) => setTimeout(resolve, 100));
        } catch (error) {
          console.error(
            "Error comparing with token:",
            registeredToken,
            error.message
          );
        }
      }

      const isDuplicate = highestConfidence >= this.confidenceThreshold;

      return {
        success: true,
        isDuplicate,
        confidence: highestConfidence,
        matched_token: matchedToken,
        message: isDuplicate
          ? "Duplicate face detected. This face has already been registered."
          : "No duplicate face found.",
      };
    } catch (error) {
      console.error("Duplicate check error:", error);
      return {
        success: false,
        error: "Could not verify duplicate status",
      };
    }
  }

  /**
   * Get service configuration status
   * @returns {Object} Configuration status
   */
  getStatus() {
    return {
      configured: !!(this.apiKey && this.apiSecret),
      base_url: this.baseUrl,
      confidence_threshold: this.confidenceThreshold,
    };
  }
}

module.exports = new FacePPService();
