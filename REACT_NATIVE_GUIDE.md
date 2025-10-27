# React Native Implementation Guide

This guide explains how to implement the Univote voting system in a React Native mobile application, focusing on session viewing, eligibility checking, and voting functionality.

## Table of Contents

1. [Overview](#overview)
2. [Department Eligibility System](#department-eligibility-system)
3. [API Endpoints](#api-endpoints)
4. [Session Listing Implementation](#session-listing-implementation)
5. [Session Detail Implementation](#session-detail-implementation)
6. [Voting Flow Implementation](#voting-flow-implementation)
7. [Error Handling](#error-handling)
8. [State Management](#state-management)
9. [Complete Example](#complete-example)

---

## Overview

The Univote system allows students to:

- View eligible voting sessions based on college, department, and level
- See detailed session information with candidates
- Submit votes with face verification and geolocation
- Track voting history

### Key Features

- **Department Eligibility**: Sessions can be restricted to specific departments
- **Face Verification**: Votes require photo capture for face detection
- **Geolocation**: Votes can require on-campus location
- **Real-time Status**: Sessions have status (upcoming, active, ended)

---

## Department Eligibility System

### How It Works

**Backend Storage:**

- `VotingSession.eligible_departments` stores department **IDs** (ObjectIds as strings)
- `Student.department` stores department **name** (e.g., "Computer Science")

**Backend Processing:**
The backend automatically converts department IDs to names before checking eligibility. This happens in:

- `sessionController.listEligibleSessions` - Filters sessions by student eligibility
- `sessionController.getSession` - Returns single session with eligibility status
- `voteController.submitVote` - Validates eligibility before accepting vote

**Frontend Impact:**
Your React Native app receives:

- Filtered session lists (only eligible sessions)
- Eligibility flags (`is_eligible`, `eligible`)
- Human-readable error messages

---

## API Endpoints

### Authentication

All requests require authentication token in header:

```javascript
headers: {
  'Authorization': `Bearer ${authToken}`,
  'Content-Type': 'application/json'
}
```

### 1. List Eligible Sessions

```
GET /api/sessions?status=active
```

**Query Parameters:**

- `status` (optional): Filter by status (`upcoming`, `active`, `ended`)

**Response:**

```json
{
  "sessions": [
    {
      "_id": "session_id",
      "title": "Student Union Elections 2024",
      "description": "Annual student leadership elections",
      "start_time": "2024-03-01T08:00:00.000Z",
      "end_time": "2024-03-01T18:00:00.000Z",
      "status": "active",
      "location": {
        "latitude": 9.082,
        "longitude": 8.6753,
        "radius": 500
      },
      "is_off_campus_allowed": false,
      "eligible_college": "Engineering",
      "has_voted": false,
      "candidate_count": 5,
      "candidates": [
        {
          "_id": "candidate_id",
          "name": "John Doe",
          "position": "President",
          "photo_url": "https://...",
          "bio": "...",
          "manifesto": "..."
        }
      ]
    }
  ]
}
```

### 2. Get Session Details

```
GET /api/sessions/:id
```

**Response:**

```json
{
  "session": {
    "id": "session_id",
    "title": "Student Union Elections 2024",
    "description": "...",
    "start_time": "2024-03-01T08:00:00.000Z",
    "end_time": "2024-03-01T18:00:00.000Z",
    "status": "active",
    "categories": ["Executive", "Senate"],
    "location": {
      "latitude": 9.0820,
      "longitude": 8.6753,
      "radius": 500
    },
    "is_off_campus_allowed": false,
    "eligible": true,
    "eligibility_reason": null,
    "has_voted": false,
    "candidates_by_position": {
      "President": [
        {
          "id": "candidate_id",
          "name": "John Doe",
          "photo_url": "https://...",
          "bio": "...",
          "manifesto": "..."
        }
      ],
      "Vice President": [...]
    }
  }
}
```

### 3. Submit Vote

```
POST /api/votes
```

**Request Body:**

```json
{
  "session_id": "session_id",
  "candidate_id": "candidate_id",
  "photo": "base64_encoded_image_string",
  "location": {
    "latitude": 9.082,
    "longitude": 8.6753
  }
}
```

**Response (Success):**

```json
{
  "message": "Vote submitted successfully",
  "vote": {
    "id": "vote_id",
    "session_id": "session_id",
    "candidate_id": "candidate_id",
    "timestamp": "2024-03-01T10:30:00.000Z"
  }
}
```

**Response (Error):**

```json
{
  "error": "You are not eligible for this voting session (department mismatch)"
}
```

---

## Session Listing Implementation

### Component Structure

```jsx
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import axios from "axios";

const SessionListScreen = () => {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState("active"); // 'all', 'active', 'upcoming', 'ended'
  const navigation = useNavigation();

  useEffect(() => {
    fetchSessions();
  }, [filter]);

  const fetchSessions = async () => {
    try {
      setLoading(true);
      const token = await getAuthToken(); // Your auth token retrieval
      const url =
        filter === "all" ? "/api/sessions" : `/api/sessions?status=${filter}`;

      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setSessions(response.data.sessions);
    } catch (error) {
      console.error("Error fetching sessions:", error);
      // Handle error (show toast/alert)
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchSessions();
    setRefreshing(false);
  };

  const renderSessionCard = ({ item }) => {
    const isActive = item.status === "active";
    const hasVoted = item.has_voted;

    return (
      <TouchableOpacity
        style={styles.sessionCard}
        onPress={() =>
          navigation.navigate("SessionDetail", { sessionId: item._id })
        }
      >
        <View style={styles.cardHeader}>
          <Text style={styles.sessionTitle}>{item.title}</Text>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: getStatusColor(item.status) },
            ]}
          >
            <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
          </View>
        </View>

        <Text style={styles.sessionDescription} numberOfLines={2}>
          {item.description}
        </Text>

        <View style={styles.cardFooter}>
          <Text style={styles.candidateCount}>
            {item.candidate_count} candidates
          </Text>

          {hasVoted && (
            <View style={styles.votedBadge}>
              <Text style={styles.votedText}>✓ Voted</Text>
            </View>
          )}

          {isActive && !hasVoted && (
            <View style={styles.voteNowBadge}>
              <Text style={styles.voteNowText}>Vote Now</Text>
            </View>
          )}
        </View>

        <View style={styles.timeContainer}>
          <Text style={styles.timeText}>
            {formatDateRange(item.start_time, item.end_time)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        {["all", "active", "upcoming", "ended"].map((status) => (
          <TouchableOpacity
            key={status}
            style={[
              styles.filterTab,
              filter === status && styles.filterTabActive,
            ]}
            onPress={() => setFilter(status)}
          >
            <Text
              style={[
                styles.filterText,
                filter === status && styles.filterTextActive,
              ]}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={sessions}
        renderItem={renderSessionCard}
        keyExtractor={(item) => item._id}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No sessions available</Text>
          </View>
        }
      />
    </View>
  );
};

// Helper functions
const getStatusColor = (status) => {
  switch (status) {
    case "active":
      return "#4CAF50";
    case "upcoming":
      return "#FF9800";
    case "ended":
      return "#9E9E9E";
    default:
      return "#2196F3";
  }
};

const formatDateRange = (start, end) => {
  const startDate = new Date(start);
  const endDate = new Date(end);
  return `${startDate.toLocaleDateString()} - ${endDate.toLocaleTimeString()}`;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F5F5",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  filterContainer: {
    flexDirection: "row",
    padding: 16,
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },
  filterTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 8,
    marginHorizontal: 4,
  },
  filterTabActive: {
    backgroundColor: "#007AFF",
  },
  filterText: {
    fontSize: 14,
    color: "#666",
  },
  filterTextActive: {
    color: "#FFF",
    fontWeight: "600",
  },
  listContainer: {
    padding: 16,
  },
  sessionCard: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  sessionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    flex: 1,
    marginRight: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 10,
    color: "#FFF",
    fontWeight: "600",
  },
  sessionDescription: {
    fontSize: 14,
    color: "#666",
    marginBottom: 12,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  candidateCount: {
    fontSize: 12,
    color: "#999",
  },
  votedBadge: {
    backgroundColor: "#E8F5E9",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  votedText: {
    fontSize: 12,
    color: "#4CAF50",
    fontWeight: "600",
  },
  voteNowBadge: {
    backgroundColor: "#E3F2FD",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  voteNowText: {
    fontSize: 12,
    color: "#2196F3",
    fontWeight: "600",
  },
  timeContainer: {
    borderTopWidth: 1,
    borderTopColor: "#F0F0F0",
    paddingTop: 8,
  },
  timeText: {
    fontSize: 12,
    color: "#999",
  },
  emptyContainer: {
    padding: 32,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 16,
    color: "#999",
  },
});

export default SessionListScreen;
```

---

## Session Detail Implementation

```jsx
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import axios from "axios";

const SessionDetailScreen = () => {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedPosition, setSelectedPosition] = useState(null);
  const navigation = useNavigation();
  const route = useRoute();
  const { sessionId } = route.params;

  useEffect(() => {
    fetchSessionDetail();
  }, []);

  const fetchSessionDetail = async () => {
    try {
      setLoading(true);
      const token = await getAuthToken();
      const response = await axios.get(`/api/sessions/${sessionId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setSession(response.data.session);

      // Auto-select first position
      const positions = Object.keys(
        response.data.session.candidates_by_position
      );
      if (positions.length > 0) {
        setSelectedPosition(positions[0]);
      }
    } catch (error) {
      console.error("Error fetching session:", error);
      Alert.alert("Error", "Failed to load session details");
    } finally {
      setLoading(false);
    }
  };

  const handleVotePress = (candidate) => {
    if (!session.eligible) {
      Alert.alert(
        "Not Eligible",
        session.eligibility_reason ||
          "You are not eligible to vote in this session"
      );
      return;
    }

    if (session.has_voted) {
      Alert.alert(
        "Already Voted",
        "You have already cast your vote in this session"
      );
      return;
    }

    if (session.status !== "active") {
      Alert.alert(
        "Session Not Active",
        "This voting session is not currently active"
      );
      return;
    }

    // Navigate to vote confirmation screen
    navigation.navigate("VoteConfirmation", {
      sessionId: session.id,
      candidate,
      sessionLocation: session.location,
      isOffCampusAllowed: session.is_off_campus_allowed,
    });
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  if (!session) {
    return (
      <View style={styles.centered}>
        <Text>Session not found</Text>
      </View>
    );
  }

  const positions = Object.keys(session.candidates_by_position);

  return (
    <ScrollView style={styles.container}>
      {/* Session Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{session.title}</Text>
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: getStatusColor(session.status) },
          ]}
        >
          <Text style={styles.statusText}>{session.status.toUpperCase()}</Text>
        </View>
      </View>

      <Text style={styles.description}>{session.description}</Text>

      {/* Eligibility Status */}
      <View
        style={[
          styles.eligibilityContainer,
          { backgroundColor: session.eligible ? "#E8F5E9" : "#FFEBEE" },
        ]}
      >
        <Text
          style={[
            styles.eligibilityText,
            { color: session.eligible ? "#4CAF50" : "#F44336" },
          ]}
        >
          {session.eligible
            ? "✓ You are eligible to vote"
            : `✗ ${session.eligibility_reason}`}
        </Text>
      </View>

      {/* Voting Status */}
      {session.has_voted && (
        <View style={styles.votedContainer}>
          <Text style={styles.votedText}>
            ✓ You have already voted in this session
          </Text>
        </View>
      )}

      {/* Time Info */}
      <View style={styles.infoContainer}>
        <Text style={styles.infoLabel}>Voting Period:</Text>
        <Text style={styles.infoValue}>
          {new Date(session.start_time).toLocaleString()} -{" "}
          {new Date(session.end_time).toLocaleString()}
        </Text>
      </View>

      {/* Location Info */}
      {!session.is_off_campus_allowed && (
        <View style={styles.infoContainer}>
          <Text style={styles.infoLabel}>Location Requirement:</Text>
          <Text style={styles.infoValue}>Must be on campus to vote</Text>
        </View>
      )}

      {/* Position Selector */}
      <View style={styles.positionSelector}>
        <Text style={styles.sectionTitle}>Select Position:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {positions.map((position) => (
            <TouchableOpacity
              key={position}
              style={[
                styles.positionTab,
                selectedPosition === position && styles.positionTabActive,
              ]}
              onPress={() => setSelectedPosition(position)}
            >
              <Text
                style={[
                  styles.positionTabText,
                  selectedPosition === position && styles.positionTabTextActive,
                ]}
              >
                {position}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Candidates */}
      <View style={styles.candidatesContainer}>
        {selectedPosition &&
          session.candidates_by_position[selectedPosition].map((candidate) => (
            <View key={candidate.id} style={styles.candidateCard}>
              <Image
                source={{ uri: candidate.photo_url }}
                style={styles.candidatePhoto}
              />
              <View style={styles.candidateInfo}>
                <Text style={styles.candidateName}>{candidate.name}</Text>
                <Text style={styles.candidatePosition}>{selectedPosition}</Text>

                {candidate.bio && (
                  <Text style={styles.candidateBio} numberOfLines={3}>
                    {candidate.bio}
                  </Text>
                )}

                {candidate.manifesto && (
                  <TouchableOpacity
                    onPress={() => {
                      Alert.alert(
                        `${candidate.name}'s Manifesto`,
                        candidate.manifesto
                      );
                    }}
                  >
                    <Text style={styles.manifestoLink}>Read Manifesto →</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[
                    styles.voteButton,
                    (!session.eligible ||
                      session.has_voted ||
                      session.status !== "active") &&
                      styles.voteButtonDisabled,
                  ]}
                  onPress={() => handleVotePress(candidate)}
                  disabled={
                    !session.eligible ||
                    session.has_voted ||
                    session.status !== "active"
                  }
                >
                  <Text style={styles.voteButtonText}>
                    {session.has_voted
                      ? "Already Voted"
                      : "Vote for this Candidate"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F5F5",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: 16,
    backgroundColor: "#FFF",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#333",
    flex: 1,
    marginRight: 12,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
    color: "#FFF",
    fontWeight: "600",
  },
  description: {
    fontSize: 16,
    color: "#666",
    padding: 16,
    backgroundColor: "#FFF",
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
  },
  eligibilityContainer: {
    margin: 16,
    padding: 12,
    borderRadius: 8,
  },
  eligibilityText: {
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
  votedContainer: {
    margin: 16,
    marginTop: 0,
    padding: 12,
    borderRadius: 8,
    backgroundColor: "#E8F5E9",
  },
  votedText: {
    fontSize: 14,
    color: "#4CAF50",
    fontWeight: "600",
    textAlign: "center",
  },
  infoContainer: {
    padding: 16,
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },
  infoLabel: {
    fontSize: 12,
    color: "#999",
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 14,
    color: "#333",
  },
  positionSelector: {
    padding: 16,
    backgroundColor: "#FFF",
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 12,
  },
  positionTab: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: "#F0F0F0",
    marginRight: 12,
  },
  positionTabActive: {
    backgroundColor: "#007AFF",
  },
  positionTabText: {
    fontSize: 14,
    color: "#666",
  },
  positionTabTextActive: {
    color: "#FFF",
    fontWeight: "600",
  },
  candidatesContainer: {
    padding: 16,
  },
  candidateCard: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    flexDirection: "row",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  candidatePhoto: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginRight: 16,
  },
  candidateInfo: {
    flex: 1,
  },
  candidateName: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 4,
  },
  candidatePosition: {
    fontSize: 14,
    color: "#007AFF",
    marginBottom: 8,
  },
  candidateBio: {
    fontSize: 14,
    color: "#666",
    marginBottom: 8,
  },
  manifestoLink: {
    fontSize: 14,
    color: "#007AFF",
    fontWeight: "600",
    marginBottom: 12,
  },
  voteButton: {
    backgroundColor: "#007AFF",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  voteButtonDisabled: {
    backgroundColor: "#CCC",
  },
  voteButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
  },
});

export default SessionDetailScreen;
```

---

## Voting Flow Implementation

```jsx
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Camera } from "expo-camera"; // or react-native-camera
import * as Location from "expo-location";
import axios from "axios";

const VoteConfirmationScreen = () => {
  const [hasPermissions, setHasPermissions] = useState(false);
  const [photoUri, setPhotoUri] = useState(null);
  const [location, setLocation] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [cameraRef, setCameraRef] = useState(null);

  const navigation = useNavigation();
  const route = useRoute();
  const { sessionId, candidate, sessionLocation, isOffCampusAllowed } =
    route.params;

  useEffect(() => {
    requestPermissions();
  }, []);

  const requestPermissions = async () => {
    try {
      // Request camera permission
      const cameraPermission = await Camera.requestCameraPermissionsAsync();

      // Request location permission
      const locationPermission =
        await Location.requestForegroundPermissionsAsync();

      if (
        cameraPermission.status === "granted" &&
        locationPermission.status === "granted"
      ) {
        setHasPermissions(true);
        await getCurrentLocation();
      } else {
        Alert.alert(
          "Permissions Required",
          "Camera and location permissions are required to vote",
          [{ text: "OK", onPress: () => navigation.goBack() }]
        );
      }
    } catch (error) {
      console.error("Permission error:", error);
    }
  };

  const getCurrentLocation = async () => {
    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      setLocation({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });

      // Check geofence if required
      if (!isOffCampusAllowed && sessionLocation) {
        const distance = calculateDistance(
          location.coords.latitude,
          location.coords.longitude,
          sessionLocation.latitude,
          sessionLocation.longitude
        );

        if (distance > sessionLocation.radius) {
          Alert.alert(
            "Location Requirement",
            "You must be on campus to vote. Please move to campus and try again.",
            [{ text: "OK", onPress: () => navigation.goBack() }]
          );
        }
      }
    } catch (error) {
      console.error("Location error:", error);
      Alert.alert("Error", "Failed to get your location");
    }
  };

  const takePicture = async () => {
    if (cameraRef) {
      try {
        const photo = await cameraRef.takePictureAsync({
          quality: 0.7,
          base64: true,
        });
        setPhotoUri(photo.uri);
      } catch (error) {
        console.error("Camera error:", error);
        Alert.alert("Error", "Failed to capture photo");
      }
    }
  };

  const retakePicture = () => {
    setPhotoUri(null);
  };

  const submitVote = async () => {
    if (!photoUri) {
      Alert.alert(
        "Photo Required",
        "Please capture your photo to verify your identity"
      );
      return;
    }

    if (!location) {
      Alert.alert("Location Required", "Please enable location services");
      return;
    }

    Alert.alert(
      "Confirm Vote",
      `Are you sure you want to vote for ${candidate.name}? This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm Vote",
          onPress: async () => {
            try {
              setSubmitting(true);

              const token = await getAuthToken();

              // Read photo as base64
              const base64Photo = await readPhotoAsBase64(photoUri);

              const response = await axios.post(
                "/api/votes",
                {
                  session_id: sessionId,
                  candidate_id: candidate.id,
                  photo: base64Photo,
                  location: location,
                },
                {
                  headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                  },
                }
              );

              // Success
              Alert.alert(
                "Vote Submitted",
                "Your vote has been successfully recorded. Thank you for participating!",
                [
                  {
                    text: "OK",
                    onPress: () => navigation.navigate("SessionList"),
                  },
                ]
              );
            } catch (error) {
              console.error("Vote submission error:", error);

              let errorMessage = "Failed to submit vote. Please try again.";

              if (
                error.response &&
                error.response.data &&
                error.response.data.error
              ) {
                errorMessage = error.response.data.error;
              }

              Alert.alert("Error", errorMessage);
            } finally {
              setSubmitting(false);
            }
          },
        },
      ]
    );
  };

  if (!hasPermissions) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Requesting permissions...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Confirm Your Vote</Text>
        <Text style={styles.subtitle}>
          Voting for: <Text style={styles.candidateName}>{candidate.name}</Text>
        </Text>
      </View>

      {!photoUri ? (
        <View style={styles.cameraContainer}>
          <Camera
            style={styles.camera}
            type={Camera.Constants.Type.front}
            ref={(ref) => setCameraRef(ref)}
          />

          <View style={styles.cameraOverlay}>
            <View style={styles.faceOutline} />
            <Text style={styles.cameraInstruction}>
              Position your face within the frame
            </Text>
          </View>

          <TouchableOpacity style={styles.captureButton} onPress={takePicture}>
            <View style={styles.captureButtonInner} />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.previewContainer}>
          <Image source={{ uri: photoUri }} style={styles.previewImage} />

          <View style={styles.previewActions}>
            <TouchableOpacity
              style={styles.retakeButton}
              onPress={retakePicture}
            >
              <Text style={styles.retakeButtonText}>Retake Photo</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.submitButton,
                submitting && styles.submitButtonDisabled,
              ]}
              onPress={submitVote}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.submitButtonText}>Submit Vote</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={styles.infoContainer}>
        <Text style={styles.infoTitle}>Verification Requirements:</Text>
        <Text style={styles.infoText}>
          ✓ Face photo for identity verification
        </Text>
        <Text style={styles.infoText}>
          {isOffCampusAllowed
            ? "✓ Location tracking (off-campus allowed)"
            : "✓ Must be on campus"}
        </Text>
        <Text style={styles.infoText}>✓ One vote per session</Text>
      </View>
    </View>
  );
};

// Helper functions
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
};

const readPhotoAsBase64 = async (uri) => {
  // Implementation depends on your setup
  // For expo: use FileSystem.readAsStringAsync
  // For react-native: use RNFS or similar
  const FileSystem = require("expo-file-system");
  return await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FFF",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: "#666",
  },
  header: {
    padding: 20,
    backgroundColor: "#FFF",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#666",
  },
  candidateName: {
    fontWeight: "bold",
    color: "#007AFF",
  },
  cameraContainer: {
    flex: 1,
    position: "relative",
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 100,
    justifyContent: "center",
    alignItems: "center",
  },
  faceOutline: {
    width: 250,
    height: 300,
    borderWidth: 2,
    borderColor: "#FFF",
    borderRadius: 125,
    borderStyle: "dashed",
  },
  cameraInstruction: {
    marginTop: 20,
    color: "#FFF",
    fontSize: 16,
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: 10,
    borderRadius: 5,
  },
  captureButton: {
    position: "absolute",
    bottom: 30,
    alignSelf: "center",
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: "#FFF",
    justifyContent: "center",
    alignItems: "center",
  },
  captureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#007AFF",
  },
  previewContainer: {
    flex: 1,
  },
  previewImage: {
    flex: 1,
    resizeMode: "cover",
  },
  previewActions: {
    flexDirection: "row",
    padding: 20,
    backgroundColor: "#FFF",
    gap: 12,
  },
  retakeButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 8,
    backgroundColor: "#F0F0F0",
    alignItems: "center",
  },
  retakeButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  submitButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 8,
    backgroundColor: "#007AFF",
    alignItems: "center",
  },
  submitButtonDisabled: {
    backgroundColor: "#CCC",
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFF",
  },
  infoContainer: {
    padding: 20,
    backgroundColor: "#FFF",
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 12,
  },
  infoText: {
    fontSize: 14,
    color: "#666",
    marginBottom: 8,
  },
});

export default VoteConfirmationScreen;
```

---

## Error Handling

### Common Errors and Handling

```javascript
// Error handling utility
export const handleApiError = (error) => {
  if (error.response) {
    // Server responded with error
    const { status, data } = error.response;

    switch (status) {
      case 400:
        return data.error || "Invalid request";

      case 401:
        return "Session expired. Please log in again";

      case 403:
        // Eligibility errors
        return data.error || "Access denied";

      case 404:
        return "Session or candidate not found";

      case 409:
        return "You have already voted in this session";

      case 500:
        return "Server error. Please try again later";

      default:
        return data.error || "An error occurred";
    }
  } else if (error.request) {
    // No response received
    return "No internet connection";
  } else {
    // Request setup error
    return "Failed to make request";
  }
};

// Usage in components
try {
  await axios.post("/api/votes", voteData);
} catch (error) {
  const errorMessage = handleApiError(error);
  Alert.alert("Error", errorMessage);
}
```

### Eligibility Error Messages

The backend returns specific error messages for eligibility failures:

- **College Mismatch**: `"You are not eligible for this voting session (college mismatch)"`
- **Department Mismatch**: `"You are not eligible for this voting session (department mismatch)"`
- **Level Mismatch**: `"You are not eligible for this voting session (level mismatch)"`
- **Geofence Violation**: `"You must be within the designated geofence to vote"`
- **Already Voted**: `"You have already voted in this session"`
- **Face Detection Failed**: `"Face detection failed. Please ensure your face is clearly visible"`

---

## State Management

### Using React Context (Recommended)

```javascript
// contexts/VotingContext.js
import React, { createContext, useState, useContext, useEffect } from "react";
import axios from "axios";

const VotingContext = createContext();

export const VotingProvider = ({ children }) => {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [authToken, setAuthToken] = useState(null);

  const fetchSessions = async (filter = "all") => {
    try {
      setLoading(true);
      const url =
        filter === "all" ? "/api/sessions" : `/api/sessions?status=${filter}`;

      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${authToken}` },
      });

      setSessions(response.data.sessions);
    } catch (error) {
      console.error("Fetch sessions error:", error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const submitVote = async (sessionId, candidateId, photo, location) => {
    try {
      const response = await axios.post(
        "/api/votes",
        {
          session_id: sessionId,
          candidate_id: candidateId,
          photo,
          location,
        },
        {
          headers: { Authorization: `Bearer ${authToken}` },
        }
      );

      // Refresh sessions to update has_voted status
      await fetchSessions();

      return response.data;
    } catch (error) {
      console.error("Submit vote error:", error);
      throw error;
    }
  };

  return (
    <VotingContext.Provider
      value={{
        sessions,
        loading,
        authToken,
        setAuthToken,
        fetchSessions,
        submitVote,
      }}
    >
      {children}
    </VotingContext.Provider>
  );
};

export const useVoting = () => {
  const context = useContext(VotingContext);
  if (!context) {
    throw new Error("useVoting must be used within VotingProvider");
  }
  return context;
};
```

### Using Redux Toolkit (Alternative)

```javascript
// store/votingSlice.js
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import axios from "axios";

export const fetchSessions = createAsyncThunk(
  "voting/fetchSessions",
  async ({ token, filter = "all" }, { rejectWithValue }) => {
    try {
      const url =
        filter === "all" ? "/api/sessions" : `/api/sessions?status=${filter}`;

      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      return response.data.sessions;
    } catch (error) {
      return rejectWithValue(error.response.data);
    }
  }
);

export const submitVote = createAsyncThunk(
  "voting/submitVote",
  async (
    { token, sessionId, candidateId, photo, location },
    { rejectWithValue }
  ) => {
    try {
      const response = await axios.post(
        "/api/votes",
        {
          session_id: sessionId,
          candidate_id: candidateId,
          photo,
          location,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      return response.data;
    } catch (error) {
      return rejectWithValue(error.response.data);
    }
  }
);

const votingSlice = createSlice({
  name: "voting",
  initialState: {
    sessions: [],
    loading: false,
    error: null,
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchSessions.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchSessions.fulfilled, (state, action) => {
        state.loading = false;
        state.sessions = action.payload;
      })
      .addCase(fetchSessions.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(submitVote.fulfilled, (state, action) => {
        // Update session to mark as voted
        const sessionId = action.meta.arg.sessionId;
        const session = state.sessions.find((s) => s._id === sessionId);
        if (session) {
          session.has_voted = true;
        }
      });
  },
});

export default votingSlice.reducer;
```

---

## Complete Example

### Navigation Setup

```javascript
// App.js
import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { VotingProvider } from "./contexts/VotingContext";

import SessionListScreen from "./screens/SessionListScreen";
import SessionDetailScreen from "./screens/SessionDetailScreen";
import VoteConfirmationScreen from "./screens/VoteConfirmationScreen";
import LoginScreen from "./screens/LoginScreen";

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <VotingProvider>
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName="Login"
          screenOptions={{
            headerStyle: { backgroundColor: "#007AFF" },
            headerTintColor: "#FFF",
            headerTitleStyle: { fontWeight: "bold" },
          }}
        >
          <Stack.Screen
            name="Login"
            component={LoginScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="SessionList"
            component={SessionListScreen}
            options={{ title: "Voting Sessions" }}
          />
          <Stack.Screen
            name="SessionDetail"
            component={SessionDetailScreen}
            options={{ title: "Session Details" }}
          />
          <Stack.Screen
            name="VoteConfirmation"
            component={VoteConfirmationScreen}
            options={{ title: "Confirm Vote" }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </VotingProvider>
  );
}
```

### API Configuration

```javascript
// config/api.js
import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";

const API_BASE_URL = "https://your-backend-url.com"; // Update this

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor to add auth token
apiClient.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem("authToken");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response && error.response.status === 401) {
      // Token expired - logout user
      await AsyncStorage.removeItem("authToken");
      // Navigate to login screen
    }
    return Promise.reject(error);
  }
);

export default apiClient;

// Helper to get auth token
export const getAuthToken = async () => {
  return await AsyncStorage.getItem("authToken");
};

// Helper to set auth token
export const setAuthToken = async (token) => {
  await AsyncStorage.setItem("authToken", token);
};
```

---

## Testing Recommendations

### Unit Tests

```javascript
// __tests__/SessionListScreen.test.js
import React from "react";
import { render, waitFor, fireEvent } from "@testing-library/react-native";
import SessionListScreen from "../screens/SessionListScreen";
import axios from "axios";

jest.mock("axios");

describe("SessionListScreen", () => {
  it("renders sessions correctly", async () => {
    const mockSessions = {
      sessions: [
        {
          _id: "1",
          title: "Test Session",
          description: "Test",
          status: "active",
          has_voted: false,
          candidate_count: 3,
        },
      ],
    };

    axios.get.mockResolvedValue({ data: mockSessions });

    const { getByText } = render(<SessionListScreen />);

    await waitFor(() => {
      expect(getByText("Test Session")).toBeTruthy();
    });
  });
});
```

### Integration Tests

```javascript
// Test voting flow
describe("Voting Flow", () => {
  it("completes full voting process", async () => {
    // 1. Fetch sessions
    // 2. Select session
    // 3. Select candidate
    // 4. Capture photo
    // 5. Submit vote
    // 6. Verify success
  });
});
```

---

## Best Practices

1. **Always check eligibility** before allowing vote submission
2. **Cache session data** to reduce API calls
3. **Handle offline scenarios** gracefully
4. **Validate permissions** before accessing camera/location
5. **Use optimized images** to reduce data usage
6. **Implement retry logic** for failed requests
7. **Clear sensitive data** after vote submission
8. **Test on different devices** and network conditions
9. **Follow platform-specific** UI guidelines (iOS/Android)
10. **Implement analytics** to track user engagement

---

## Summary

This guide provides complete implementation details for:

- ✅ Fetching and displaying voting sessions
- ✅ Checking department eligibility (handled automatically by backend)
- ✅ Showing session details with candidates
- ✅ Implementing the voting flow with photo capture
- ✅ Handling geolocation requirements
- ✅ Managing state and errors
- ✅ Following React Native best practices

The backend automatically handles department ID to name conversion, so your React Native app can trust the eligibility flags and error messages returned by the API.
