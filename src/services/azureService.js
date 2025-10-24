const axios = require("axios");

const AZURE_ENDPOINT = process.env.AZURE_FACE_ENDPOINT;
const AZURE_KEY = process.env.AZURE_FACE_KEY;
const FACE_THRESHOLD = parseFloat(process.env.AZURE_FACE_THRESHOLD || 0.7);

/**
 * Azure Face API Service
 * Handles face detection, verification, and duplicate detection
 */
class AzureFaceService {
  constructor() {
    this.endpoint = AZURE_ENDPOINT;
    this.subscriptionKey = AZURE_KEY;
    this.headers = {
      "Ocp-Apim-Subscription-Key": this.subscriptionKey,
      "Content-Type": "application/json",
    };
  }

  /**
   * Detect faces in an image
   * @param {string} imageUrl - URL of the image
   * @returns {Object} Face detection result with faceId
   */
  async detectFace(imageUrl) {
    try {
      const response = await axios.post(
        `${this.endpoint}/detect`,
        { url: imageUrl },
        {
          headers: this.headers,
          params: {
            returnFaceId: true,
            returnFaceLandmarks: false,
            recognitionModel: "recognition_04",
            returnRecognitionModel: false,
            detectionModel: "detection_03",
            faceIdTimeToLive: 86400,
          },
        }
      );

      if (!response.data || response.data.length === 0) {
        return {
          success: false,
          error: "No face detected. Please upload a clear face image.",
        };
      }

      if (response.data.length > 1) {
        return {
          success: false,
          error:
            "Multiple faces detected. Please submit a single-person selfie.",
        };
      }

      return {
        success: true,
        faceId: response.data[0].faceId,
        faceData: response.data[0],
      };
    } catch (error) {
      console.error(
        "Azure Face Detection Error:",
        error.response?.data || error.message
      );
      return {
        success: false,
        error: "Face detection failed. Please try again.",
      };
    }
  }

  /**
   * Create a PersonGroup for a voting session
   * @param {string} personGroupId - Unique ID for the person group
   * @param {string} name - Name of the person group
   * @returns {boolean} Success status
   */
  async createPersonGroup(personGroupId, name) {
    try {
      await axios.put(
        `${this.endpoint}/persongroups/${personGroupId}`,
        {
          name: name,
          recognitionModel: "recognition_04",
        },
        { headers: this.headers }
      );
      return true;
    } catch (error) {
      // Ignore if already exists
      if (error.response?.status === 409) {
        return true;
      }
      console.error(
        "Create PersonGroup Error:",
        error.response?.data || error.message
      );
      return false;
    }
  }

  /**
   * Delete a PersonGroup
   * @param {string} personGroupId - ID of the person group to delete
   * @returns {boolean} Success status
   */
  async deletePersonGroup(personGroupId) {
    try {
      await axios.delete(`${this.endpoint}/persongroups/${personGroupId}`, {
        headers: this.headers,
      });
      return true;
    } catch (error) {
      console.error(
        "Delete PersonGroup Error:",
        error.response?.data || error.message
      );
      return false;
    }
  }

  /**
   * Create a Person within a PersonGroup
   * @param {string} personGroupId - PersonGroup ID
   * @param {string} name - Person name
   * @returns {string|null} Person ID
   */
  async createPerson(personGroupId, name) {
    try {
      const response = await axios.post(
        `${this.endpoint}/persongroups/${personGroupId}/persons`,
        { name },
        { headers: this.headers }
      );
      return response.data.personId;
    } catch (error) {
      console.error(
        "Create Person Error:",
        error.response?.data || error.message
      );
      return null;
    }
  }

  /**
   * Add a face to a Person
   * @param {string} personGroupId - PersonGroup ID
   * @param {string} personId - Person ID
   * @param {string} imageUrl - Face image URL
   * @returns {string|null} Persisted Face ID
   */
  async addPersonFace(personGroupId, personId, imageUrl) {
    try {
      const response = await axios.post(
        `${this.endpoint}/persongroups/${personGroupId}/persons/${personId}/persistedFaces`,
        { url: imageUrl },
        {
          headers: this.headers,
          params: {
            detectionModel: "detection_03",
          },
        }
      );
      return response.data.persistedFaceId;
    } catch (error) {
      console.error(
        "Add Person Face Error:",
        error.response?.data || error.message
      );
      return null;
    }
  }

  /**
   * Train a PersonGroup
   * @param {string} personGroupId - PersonGroup ID
   * @returns {boolean} Success status
   */
  async trainPersonGroup(personGroupId) {
    try {
      await axios.post(
        `${this.endpoint}/persongroups/${personGroupId}/train`,
        {},
        { headers: this.headers }
      );

      // Wait for training to complete
      await this.waitForTraining(personGroupId);
      return true;
    } catch (error) {
      console.error(
        "Train PersonGroup Error:",
        error.response?.data || error.message
      );
      return false;
    }
  }

  /**
   * Wait for PersonGroup training to complete
   * @param {string} personGroupId - PersonGroup ID
   */
  async waitForTraining(personGroupId, maxAttempts = 10) {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const response = await axios.get(
          `${this.endpoint}/persongroups/${personGroupId}/training`,
          { headers: this.headers }
        );

        if (response.data.status === "succeeded") {
          return true;
        } else if (response.data.status === "failed") {
          return false;
        }

        // Wait 1 second before checking again
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        console.error("Training status check error:", error.message);
      }
    }
    return false;
  }

  /**
   * Identify a face against a PersonGroup
   * @param {string} personGroupId - PersonGroup ID
   * @param {string} faceId - Face ID to identify
   * @returns {Object} Identification result
   */
  async identifyFace(personGroupId, faceId) {
    try {
      const response = await axios.post(
        `${this.endpoint}/identify`,
        {
          faceIds: [faceId],
          personGroupId: personGroupId,
          maxNumOfCandidatesReturned: 1,
          confidenceThreshold: FACE_THRESHOLD,
        },
        { headers: this.headers }
      );

      if (
        response.data &&
        response.data.length > 0 &&
        response.data[0].candidates.length > 0
      ) {
        const candidate = response.data[0].candidates[0];
        return {
          success: true,
          matched: true,
          personId: candidate.personId,
          confidence: candidate.confidence,
        };
      }

      return {
        success: true,
        matched: false,
      };
    } catch (error) {
      console.error(
        "Identify Face Error:",
        error.response?.data || error.message
      );
      return {
        success: false,
        error: "Face identification failed",
      };
    }
  }

  /**
   * Verify two faces match
   * @param {string} faceId1 - First face ID
   * @param {string} faceId2 - Second face ID
   * @returns {Object} Verification result
   */
  async verifyFaces(faceId1, faceId2) {
    try {
      const response = await axios.post(
        `${this.endpoint}/verify`,
        {
          faceId1,
          faceId2,
        },
        { headers: this.headers }
      );

      return {
        success: true,
        isIdentical: response.data.isIdentical,
        confidence: response.data.confidence,
      };
    } catch (error) {
      console.error(
        "Verify Faces Error:",
        error.response?.data || error.message
      );
      return {
        success: false,
        error: "Face verification failed",
      };
    }
  }

  /**
   * Check for duplicate faces in a session
   * @param {string} personGroupId - PersonGroup ID for the session
   * @param {string} newFaceId - New face ID to check
   * @returns {Object} Duplicate check result
   */
  async checkDuplicateInSession(personGroupId, newFaceId) {
    try {
      const identifyResult = await this.identifyFace(personGroupId, newFaceId);

      if (identifyResult.matched) {
        return {
          isDuplicate: true,
          confidence: identifyResult.confidence,
          message:
            "Duplicate face detected. This face has already been used to vote in this session.",
        };
      }

      return {
        isDuplicate: false,
      };
    } catch (error) {
      console.error("Duplicate check error:", error);
      return {
        isDuplicate: false,
        error: "Could not verify duplicate status",
      };
    }
  }

  /**
   * Add a verified vote face to the session PersonGroup
   * @param {string} personGroupId - PersonGroup ID
   * @param {string} studentMatric - Student matric number (used as person name)
   * @param {string} imageUrl - Face image URL
   * @returns {Object} Result with personId and persistedFaceId
   */
  async addVoteFaceToSession(personGroupId, studentMatric, imageUrl) {
    try {
      // Create person for this vote
      const personId = await this.createPerson(personGroupId, studentMatric);
      if (!personId) {
        return { success: false, error: "Failed to create person" };
      }

      // Add face to person
      const persistedFaceId = await this.addPersonFace(
        personGroupId,
        personId,
        imageUrl
      );
      if (!persistedFaceId) {
        return { success: false, error: "Failed to add face" };
      }

      // Train the PersonGroup
      await this.trainPersonGroup(personGroupId);

      return {
        success: true,
        personId,
        persistedFaceId,
      };
    } catch (error) {
      console.error("Add vote face error:", error);
      return { success: false, error: "Failed to register face" };
    }
  }
}

module.exports = new AzureFaceService();
