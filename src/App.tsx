import React, { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  MessageSquare,
  Users,
  Radio,
  BookOpen,
  Mic,
  Send,
  Image as ImageIcon,
  Trash2,
  Plus,
  X,
  ChevronRight,
  Sparkles,
  Info,
  Settings,
  User,
  RefreshCw,
  Phone,
  PhoneOff,
  PenSquare,
  Smile,
  Heart,
  Brain,
  Camera,
  Upload,
  AlertTriangle
} from "lucide-react";
import { Message, Character, SharedFact, UserProfile, GroupChat, StoryLog } from "./types";
import { CHARACTERS } from "./characters";

// Helper to compress base64 images (scales down to max 800px width/height and quality 0.7) to prevent exceeding localStorage quota
const compressImage = (base64Str: string, maxWidth = 800, maxHeight = 800, quality = 0.7): Promise<string> => {
  return new Promise((resolve) => {
    if (!base64Str || !base64Str.startsWith("data:image/")) {
      resolve(base64Str);
      return;
    }

    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(base64Str);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      const compressedBase64 = canvas.toDataURL("image/jpeg", quality);
      resolve(compressedBase64);
    };
    img.onerror = () => {
      resolve(base64Str);
    };
  });
};

const safeSetLocalStorage = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch (e: any) {
    if (e.name === "QuotaExceededError" || e.code === 22) {
      console.warn("Storage quota exceeded, could not save item: " + key);
    } else {
      console.error("Local storage error: ", e);
    }
  }
};

export default function App() {
  // --- Persistent States ---
  const [userProfile, setUserProfile] = useState<UserProfile | null>(() => {
    const saved = localStorage.getItem("roleplay_user_profile_v2");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed) {
          parsed.gender = "Женский";
          return parsed;
        }
      } catch (e) {
        console.error("Error parsing user profile", e);
      }
    }
    return null;
  });

  const [characters, setCharacters] = useState<Character[]>(() => {
    const profileSaved = localStorage.getItem("roleplay_user_profile_v2");
    const profileObj = profileSaved ? JSON.parse(profileSaved) : null;
    const hasPhoto = !!profileObj?.photo;

    const adjustLustForNoPhoto = (chars: Character[]) => {
      if (!hasPhoto) {
        const attr = profileObj?.attractiveness ?? 80;
        return chars.map(c => {
          const isRelative = ["mother", "father", "brother", "grandfather"].includes(c.id);
          if (isRelative) {
            return {
              ...c,
              scales: c.scales ? { ...c.scales, lust: 0 } : { trust: 50, love: 0, lust: 0, anger: 0 }
            };
          }
          let baseLust = 0;
          if (c.id === "max") baseLust = Math.round(attr * 0.95);
          else if (c.id === "artem") baseLust = Math.round(attr * 0.8);
          else if (c.id === "masha") baseLust = Math.round(attr * 0.4);
          else if (c.id === "colleague") baseLust = Math.round(attr * 0.85);
          else if (c.id === "neighbor") baseLust = Math.round(attr * 0.25);
          else if (c.id === "semenych") baseLust = Math.round(attr * 0.15);
          else if (c.id === "mihalych") baseLust = Math.round(attr * 0.05);

          return {
            ...c,
            scales: c.scales ? { ...c.scales, lust: baseLust } : { trust: 50, love: 0, lust: baseLust, anger: 0 }
          };
        });
      }
      return chars;
    };

    const saved = localStorage.getItem("roleplay_characters_v2");
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Character[];
        const defaultIds = CHARACTERS.map(c => c.id);
        const parsedIds = parsed.map(c => c.id);
        // Find any default characters that are missing (e.g. max)
        const missingDefaults = CHARACTERS.filter(c => !parsedIds.includes(c.id));
        // Also update existing default characters if they were modified in CHARACTERS
        const updatedParsed = parsed.map(c => {
          const matchedDefault = CHARACTERS.find(dc => dc.id === c.id);
          if (matchedDefault) {
            return {
              ...matchedDefault,
              ...c,
            };
          }
          return c;
        });

        const merged = missingDefaults.length > 0 ? [...missingDefaults, ...updatedParsed] : updatedParsed;
        const adjusted = adjustLustForNoPhoto(merged);
        safeSetLocalStorage("roleplay_characters_v2", JSON.stringify(adjusted));
        return adjusted;
      } catch (e) {
        return adjustLustForNoPhoto(CHARACTERS);
      }
    }
    return adjustLustForNoPhoto(CHARACTERS);
  });

  const [groupChats, setGroupChats] = useState<GroupChat[]>(() => {
    const saved = localStorage.getItem("roleplay_group_chats_v2");
    return saved ? JSON.parse(saved) : [];
  });

  const [selectedChatId, setSelectedChatId] = useState<string>(() => {
    const saved = localStorage.getItem("roleplay_selected_chat_id_v2");
    return saved || "max";
  });

  const [messages, setMessages] = useState<Record<string, Message[]>>(() => {
    const saved = localStorage.getItem("roleplay_messages_v2");
    return saved ? JSON.parse(saved) : {};
  });

  const [sharedFacts, setSharedFacts] = useState<SharedFact[]>(() => {
    const saved = localStorage.getItem("roleplay_shared_facts_v2");
    return saved ? JSON.parse(saved) : [];
  });

  const [storyLog, setStoryLog] = useState<StoryLog | null>(() => {
    const saved = localStorage.getItem("roleplay_story_log_v2");
    return saved ? JSON.parse(saved) : null;
  });

  // --- UI/UX Interactive States ---
  const [activeTab, setActiveTab] = useState<"chat" | "lore" | "story" | "profile">("chat");
  const [inputText, setInputText] = useState("");
  const [aiMode, setAiMode] = useState<"standard" | "high_thinking" | "low_latency">(() => {
    const saved = localStorage.getItem("roleplay_ai_mode_v2");
    return (saved as any) || "standard";
  });
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null);
  const [gossipNotification, setGossipNotification] = useState<string | null>(null);
  const [systemError, setSystemError] = useState<string | null>(null);
  const [systemStatusMessage, setSystemStatusMessage] = useState<string>("Все системы работают стабильно");
  const [isStoryLoading, setIsStoryLoading] = useState(false);
  const [customDirectiveText, setCustomDirectiveText] = useState("");
  const [showChatSwitcherModal, setShowChatSwitcherModal] = useState(false);
  const [sendAsNarrator, setSendAsNarrator] = useState(false);

  // User Profile edit mode
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showThoughtsModal, setShowThoughtsModal] = useState(false);
  const [showCharInfoModal, setShowCharInfoModal] = useState(false);
  const [profileFormError, setProfileFormError] = useState<string | null>(null);
  const [isEvaluatingPhoto, setIsEvaluatingPhoto] = useState(false);
  const [evaluationError, setEvaluationError] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [setupStage, setSetupStage] = useState(0);
  const [thoughtsLoading, setThoughtsLoading] = useState(false);
  const [thoughtsData, setThoughtsData] = useState<{ thoughts: string; motives: string; visualAttitude: string; nextActionPlan: string; } | null>(null);
  const [thoughtsError, setThoughtsError] = useState<string | null>(null);
  const [profileName, setProfileName] = useState(userProfile?.name || "");
  const [profileGender, setProfileGender] = useState<"Мужской" | "Женский" | "Другой">(userProfile?.gender || "Женский");
  const [profileAge, setProfileAge] = useState<number>(userProfile?.age || 23);
  const [profileBio, setProfileBio] = useState(userProfile?.bio || "");
  const [profileTraits, setProfileTraits] = useState(userProfile?.traits || "");
  const [profileAttractiveness, setProfileAttractiveness] = useState<number>(userProfile?.attractiveness ?? 80);

  // Physical appearance details states
  const [profileFace, setProfileFace] = useState(userProfile?.appearance?.face || "Привлекательное, чистое лицо");
  const [profileChest, setProfileChest] = useState(userProfile?.appearance?.chest || "Упругая, округлая грудь");
  const [profileWaist, setProfileWaist] = useState(userProfile?.appearance?.waist || "Тонкая талия, плоский живот");
  const [profileHips, setProfileHips] = useState(userProfile?.appearance?.hips || "Выразительные, округлые бёдра");
  const [profileIntimate, setProfileIntimate] = useState(userProfile?.appearance?.intimate || "Аккуратные, ухоженные интимные зоны");
  const [profileLegs, setProfileLegs] = useState(userProfile?.appearance?.legs || "Стройные, длинные ноги");
  const [profileOverall, setProfileOverall] = useState(userProfile?.appearance?.overall || "Здоровое, спортивное и ухоженное тело без уродств");
  const [profilePhoto, setProfilePhoto] = useState<string | null>(userProfile?.photo || null);
  const [profileDetailedAnalysis, setProfileDetailedAnalysis] = useState(userProfile?.detailedAnalysis || "");
  const [profileImageSceneDescription, setProfileImageSceneDescription] = useState(userProfile?.imageSceneDescription || "");
  const [profilePlotContext, setProfilePlotContext] = useState(userProfile?.plotContext || "");

  // Character Add/Edit Modal
  const [showCharModal, setShowCharModal] = useState(false);
  const [editingCharId, setEditingCharId] = useState<string | null>(null); // null means "create mode"
  const [charName, setCharName] = useState("");
  const [charRole, setCharRole] = useState("");
  const [charGroup, setCharGroup] = useState<"Друзья" | "Семья" | "Работа" | "Соседи">("Друзья");
  const [charPersonality, setCharPersonality] = useState("");
  const [charSpeech, setCharSpeech] = useState("");
  const [charAttitude, setCharAttitude] = useState("");
  const [charGreeting, setCharGreeting] = useState("");

  // Adult 21+ character qualities states
  const [charTrust, setCharTrust] = useState(50);
  const [charLove, setCharLove] = useState(0);
  const [charLust, setCharLust] = useState(0);
  const [charAnger, setCharAnger] = useState(0);
  const [charFetishes, setCharFetishes] = useState("");
  const [charInclinations, setCharInclinations] = useState("");

  // Group creation Modal
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);

  // Confirmation Modals states
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [charIdToDelete, setCharIdToDelete] = useState<string | null>(null);

  // Call simulation overlay
  const [activeCall, setActiveCall] = useState<{
    characterId: string;
    status: "calling" | "connected" | "ended";
    duration: number;
    type: "phone" | "in_person";
  } | null>(null);
  const [callInputText, setCallInputText] = useState("");
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Group chat responder selection state
  // key is groupChatId, value is characterId of participant (or "auto")
  const [groupResponders, setGroupResponders] = useState<Record<string, string>>({});

  // Refs for scroll and files
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync to LocalStorage safely to prevent QuotaExceededError crash on large photos
  useEffect(() => {
    if (userProfile) {
      safeSetLocalStorage("roleplay_user_profile_v2", JSON.stringify(userProfile));
    } else {
      localStorage.removeItem("roleplay_user_profile_v2");
    }
  }, [userProfile]);

  useEffect(() => {
    safeSetLocalStorage("roleplay_characters_v2", JSON.stringify(characters));
  }, [characters]);

  useEffect(() => {
    safeSetLocalStorage("roleplay_group_chats_v2", JSON.stringify(groupChats));
  }, [groupChats]);

  useEffect(() => {
    safeSetLocalStorage("roleplay_selected_chat_id_v2", selectedChatId);
  }, [selectedChatId]);

  useEffect(() => {
    safeSetLocalStorage("roleplay_messages_v2", JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    safeSetLocalStorage("roleplay_ai_mode_v2", aiMode);
  }, [aiMode]);

  useEffect(() => {
    safeSetLocalStorage("roleplay_shared_facts_v2", JSON.stringify(sharedFacts));
  }, [sharedFacts]);

  useEffect(() => {
    if (storyLog) {
      safeSetLocalStorage("roleplay_story_log_v2", JSON.stringify(storyLog));
    } else {
      localStorage.removeItem("roleplay_story_log_v2");
    }
  }, [storyLog]);

  // Scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, selectedChatId, isLoading, activeCall]);

  // Active call timer
  useEffect(() => {
    if (activeCall && activeCall.status === "connected") {
      callTimerRef.current = setInterval(() => {
        setActiveCall(prev => {
          if (!prev) return null;
          return { ...prev, duration: prev.duration + 1 };
        });
      }, 1000);
    } else {
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
        callTimerRef.current = null;
      }
    }
    return () => {
      if (callTimerRef.current) clearInterval(callTimerRef.current);
    };
  }, [activeCall?.status]);

  // Determine if active chat is a group chat or a private chat
  const activeGroup = useMemo(() => {
    return groupChats.find(g => g.id === selectedChatId) || null;
  }, [groupChats, selectedChatId]);

  const activeChar = useMemo(() => {
    if (activeGroup) return null;
    return characters.find(c => c.id === selectedChatId) || characters[0] || null;
  }, [characters, selectedChatId, activeGroup]);

  // Selected group participant characters
  const activeGroupParticipants = useMemo(() => {
    if (!activeGroup) return [];
    return characters.filter(c => activeGroup.participantIds.includes(c.id));
  }, [activeGroup, characters]);

  // Filter facts visible to the active character/group based on their group
  const visibleFacts = useMemo(() => {
    if (activeGroup) {
      // In a group chat, any facts related to participants are visible
      return sharedFacts.filter(fact => 
        fact.group === "Все" || 
        activeGroup.participantIds.includes(fact.sourceCharacterId)
      );
    }
    if (!activeChar) return [];
    return sharedFacts.filter(fact => 
      fact.group === "Все" || 
      fact.group === activeChar.group || 
      fact.sourceCharacterId === activeChar.id
    );
  }, [sharedFacts, activeChar, activeGroup]);

  // Profile setup handler
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileFormError(null);
    if (!profileName.trim() || !profileBio.trim() || !profileTraits.trim()) {
      setProfileFormError("Пожалуйста, заполните все поля профиля!");
      return;
    }

    setIsSavingProfile(true);
    setSetupStage(1); // Stage 1: Reading profile bio and parameters

    await new Promise(resolve => setTimeout(resolve, 150));
    setSetupStage(2); // Stage 2: Syncing character fetishes & lust

    if (!profilePhoto) {
      // Scale lust scores dynamically based on the manually selected attractiveness level
      setCharacters(prev => prev.map(c => {
        const isRelative = ["mother", "father", "brother", "grandfather"].includes(c.id);
        if (isRelative) {
          return {
            ...c,
            scales: c.scales ? { ...c.scales, lust: 0 } : { trust: 50, love: 0, lust: 0, anger: 0 }
          };
        }
        let baseLust = 0;
        if (c.id === "max") baseLust = Math.round(profileAttractiveness * 0.95);
        else if (c.id === "artem") baseLust = Math.round(profileAttractiveness * 0.8);
        else if (c.id === "masha") baseLust = Math.round(profileAttractiveness * 0.4);
        else if (c.id === "colleague") baseLust = Math.round(profileAttractiveness * 0.85);
        else if (c.id === "neighbor") baseLust = Math.round(profileAttractiveness * 0.25);
        else if (c.id === "semenych") baseLust = Math.round(profileAttractiveness * 0.15);
        else if (c.id === "mihalych") baseLust = Math.round(profileAttractiveness * 0.05);

        return {
          ...c,
          scales: c.scales ? { ...c.scales, lust: baseLust } : { trust: 50, love: 0, lust: baseLust, anger: 0 }
        };
      }));
    } else {
      // Evaluate text descriptions to adjust lust scores
      try {
        const res = await fetch("/api/evaluate-appearance-text", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            face: profileFace,
            chest: profileChest,
            waist: profileWaist,
            hips: profileHips,
            intimate: profileIntimate,
            legs: profileLegs,
            overall: profileOverall,
            attractiveness: profileAttractiveness
          })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.lustScores) {
            setCharacters(prev => prev.map(c => {
              const score = data.lustScores[c.id];
              return score !== undefined ? {
                ...c,
                scales: c.scales ? { ...c.scales, lust: score } : { trust: 50, love: 0, lust: score, anger: 0 }
              } : c;
            }));
          }
        }
      } catch (err) {
        console.log("Evaluation of appearance text complete with fallback/result.");
      }
    }

    await new Promise(resolve => setTimeout(resolve, 200));
    setSetupStage(3); // Stage 3: Initializing storyline & relations

    await new Promise(resolve => setTimeout(resolve, 150));
    setSetupStage(4); // Stage 4: Preparing simulation world

    await new Promise(resolve => setTimeout(resolve, 100));

    const profile: UserProfile = {
      name: profileName.trim(),
      gender: profileGender,
      age: profileAge,
      bio: profileBio.trim(),
      traits: profileTraits.trim(),
      appearance: {
        face: profileFace.trim(),
        chest: profileChest.trim(),
        waist: profileWaist.trim(),
        hips: profileHips.trim(),
        intimate: profileIntimate.trim(),
        legs: profileLegs.trim(),
        overall: profileOverall.trim(),
      },
      photo: profilePhoto || undefined,
      detailedAnalysis: profileDetailedAnalysis.trim() || undefined,
      imageSceneDescription: profileImageSceneDescription.trim() || undefined,
      plotContext: profilePlotContext.trim() || undefined,
      attractiveness: profileAttractiveness
    };

    setUserProfile(profile);
    setIsSavingProfile(false);
    setSetupStage(0);
    setShowProfileModal(false);
    setGossipNotification("✨ Профиль успешно сохранен! Показатели отношений обновлены.");
    setTimeout(() => setGossipNotification(null), 4000);
  };

  const handlePhotoUploadAndEvaluation = async (file: File) => {
    const reader = new FileReader();
    reader.onloadend = async () => {
      const rawBase64 = reader.result as string;
      setIsEvaluatingPhoto(true);
      setEvaluationError(null);

      // Compress photo to prevent local storage quota limit exceeded errors
      const base64Str = await compressImage(rawBase64);
      setProfilePhoto(base64Str);

      try {
        const res = await fetch("/api/evaluate-profile-photo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ photo: base64Str })
        });

        if (res.ok) {
          const data = await res.json();
          if (data) {
            setProfileFace(data.face || "Очаровательное лицо");
            setProfileChest(data.chest || "Аккуратная грудь");
            setProfileWaist(data.waist || "Стройная талия");
            setProfileHips(data.hips || "Ухоженные бёдра");
            setProfileIntimate(data.intimate || "Аккуратные интимные зоны");
            setProfileLegs(data.legs || "Стройные ноги");
            setProfileOverall(data.overall || "Здоровое тело");
            setProfileDetailedAnalysis(data.detailedAnalysis || "");
            setProfileImageSceneDescription(data.imageSceneDescription || "");
            setProfilePlotContext(data.plotContext || "");
            
            setGossipNotification("✨ Фотография распознана! Оценки внешности и вожделения обновлены.");
            setTimeout(() => setGossipNotification(null), 4000);
          }
          if (data.lustScores) {
            setCharacters(prev => prev.map(c => {
              const score = data.lustScores[c.id];
              return score !== undefined ? {
                ...c,
                scales: c.scales ? { ...c.scales, lust: score } : { trust: 50, love: 0, lust: score, anger: 0 }
              } : c;
            }));
          }
        } else {
          const errText = await res.text();
          setEvaluationError(`Не удалось проанализировать лицо автоматически: ${errText || "ошибка сервера"}. Введите характеристики вручную!`);
        }
      } catch (err) {
        setEvaluationError("Не удалось связаться с сервером оценки. Введите характеристики вручную!");
      } finally {
        setIsEvaluatingPhoto(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // Fetch thoughts from backend
  const handleFetchThoughts = async () => {
    if (!activeChar) return;
    setThoughtsLoading(true);
    setThoughtsError(null);
    setThoughtsData(null);
    setShowThoughtsModal(true);

    try {
      // Find history of this conversation
      const currentMessages = messages[activeChar.id] || [];

      const response = await fetch("/api/thoughts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          character: activeChar,
          messages: currentMessages,
          sharedFacts: sharedFacts.map((f) => f.text),
          userProfile,
          aiMode: aiMode
        })
      });

      if (!response.ok) {
        throw new Error("Не удалось прочитать мысли персонажа. Возможно, превышен лимит или сервер временно недоступен.");
      }

      const data = await response.json();
      setThoughtsData(data);
    } catch (err: any) {
      console.log("Thoughts fetch handled with error/fallback.");
      setThoughtsError(err.message || String(err));
    } finally {
      setThoughtsLoading(false);
    }
  };

  // Reset all data to default (Start Over)
  const handleResetData = () => {
    setShowResetConfirm(true);
  };

  const executeResetData = () => {
    localStorage.clear();
    setCharacters(CHARACTERS);
    setGroupChats([]);
    setSelectedChatId("masha");
    setMessages({});
    setSharedFacts([]);
    setStoryLog(null);
    setUserProfile(null);
    setAttachedImage(null);
    setIsVoiceMode(false);
    setInputText("");
    setActiveCall(null);
    
    // Reset profile states
    setProfileName("");
    setProfileGender("Мужской");
    setProfileAge(23);
    setProfileBio("");
    setProfileTraits("");
    setProfileFace("Привлекательное, чистое лицо");
    setProfileChest("Упругая, округлая грудь");
    setProfileWaist("Тонкая талия, плоский живот");
    setProfileHips("Выразительные, округлые бёдра");
    setProfileIntimate("Аккуратные, ухоженные интимные зоны");
    setProfileLegs("Стройные, длинные ноги");
    setProfileOverall("Здоровое, спортивное и ухоженное тело без уродств");
    setProfilePhoto(null);

    // Force page reload to ensure all memory state is fully reset
    window.location.reload();
  };

  // Open Edit Profile
  const openEditProfile = () => {
    if (userProfile) {
      setProfileName(userProfile.name);
      setProfileGender(userProfile.gender);
      setProfileAge(userProfile.age);
      setProfileBio(userProfile.bio);
      setProfileTraits(userProfile.traits);
      setProfileFace(userProfile.appearance?.face || "Привлекательное, чистое лицо");
      setProfileChest(userProfile.appearance?.chest || "Упругая, округлая грудь");
      setProfileWaist(userProfile.appearance?.waist || "Тонкая талия, плоский живот");
      setProfileHips(userProfile.appearance?.hips || "Выразительные, округлые бёдра");
      setProfileIntimate(userProfile.appearance?.intimate || "Аккуратные, ухоженные интимные зоны");
      setProfileLegs(userProfile.appearance?.legs || "Стройные, длинные ноги");
      setProfileOverall(userProfile.appearance?.overall || "Здоровое, спортивное и ухоженное тело без уродств");
      setProfilePhoto(userProfile.photo || null);
      setProfileDetailedAnalysis(userProfile.detailedAnalysis || "");
      setProfileImageSceneDescription(userProfile.imageSceneDescription || "");
      setProfilePlotContext(userProfile.plotContext || "");
      setProfileAttractiveness(userProfile.attractiveness ?? 80);
    }
    setShowProfileModal(true);
  };

  // Delete a specific Character
  const handleDeleteCharacter = (charId: string) => {
    setCharIdToDelete(charId);
  };

  const executeDeleteCharacter = (charId: string) => {
    // Remove from list
    const updatedChars = characters.filter(c => c.id !== charId);
    setCharacters(updatedChars);
    
    // Remove messages
    const updatedMsgs = { ...messages };
    delete updatedMsgs[charId];
    setMessages(updatedMsgs);

    // Clean group chats containing this character
    const updatedGroups = groupChats.map(g => {
      return {
        ...g,
        participantIds: g.participantIds.filter(id => id !== charId)
      };
    }).filter(g => g.participantIds.length > 0); // remove empty groups
    setGroupChats(updatedGroups);

    // Reset selection if deleted
    if (selectedChatId === charId) {
      if (updatedChars.length > 0) {
        setSelectedChatId(updatedChars[0].id);
      } else if (updatedGroups.length > 0) {
        setSelectedChatId(updatedGroups[0].id);
      }
    }

    setShowCharModal(false);
    setEditingCharId(null);
    setCharIdToDelete(null);
    setGossipNotification("🗑️ Персонаж успешно удален.");
    setTimeout(() => setGossipNotification(null), 3000);
  };

  // Open Character Modal for edit or create
  const openCharacterModal = (charId: string | null) => {
    if (charId) {
      // Edit mode
      const char = characters.find(c => c.id === charId);
      if (char) {
        setEditingCharId(charId);
        setCharName(char.name);
        setCharRole(char.role);
        setCharGroup(char.group);
        setCharPersonality(char.personality);
        setCharSpeech(char.speechStyle);
        setCharAttitude(char.attitude);
        setCharGreeting(char.initialMessage);
        
        // Load adult stats
        setCharTrust(char.scales?.trust ?? 50);
        setCharLove(char.scales?.love ?? 0);
        setCharLust(char.scales?.lust ?? 0);
        setCharAnger(char.scales?.anger ?? 0);
        setCharFetishes(char.fetishes ? char.fetishes.join(", ") : "");
        setCharInclinations(char.inclinations ? char.inclinations.join(", ") : "");
        
        setShowCharModal(true);
      }
    } else {
      // Create mode
      setEditingCharId(null);
      setCharName("");
      setCharRole("");
      setCharGroup("Друзья");
      setCharPersonality("");
      setCharSpeech("");
      setCharAttitude("");
      setCharGreeting("");
      
      // Default creation stats
      setCharTrust(50);
      setCharLove(0);
      setCharLust(0);
      setCharAnger(0);
      setCharFetishes("");
      setCharInclinations("");
      
      setShowCharModal(true);
    }
  };

  // Create or Update Character
  const handleSaveCharacter = (e: React.FormEvent) => {
    e.preventDefault();
    if (!charName.trim() || !charRole.trim() || !charPersonality.trim()) {
      setGossipNotification("⚠️ Ошибка: Заполните все обязательные поля характера!");
      setTimeout(() => setGossipNotification(null), 4000);
      return;
    }

    const parseCommaSeparated = (val: string) => {
      return val.split(",")
        .map(item => item.trim())
        .filter(item => item.length > 0);
    };

    const newScales = {
      trust: charTrust,
      love: charLove,
      lust: charLust,
      anger: charAnger
    };
    const newFetishes = parseCommaSeparated(charFetishes);
    const newInclinations = parseCommaSeparated(charInclinations);

    if (editingCharId) {
      // Edit
      setCharacters(prev => prev.map(c => {
        if (c.id === editingCharId) {
          return {
            ...c,
            name: charName.trim(),
            role: charRole.trim(),
            group: charGroup,
            personality: charPersonality.trim(),
            speechStyle: charSpeech.trim() || c.speechStyle,
            attitude: charAttitude.trim() || c.attitude,
            initialMessage: charGreeting.trim() || c.initialMessage,
            scales: newScales,
            fetishes: newFetishes,
            inclinations: newInclinations
          };
        }
        return c;
      }));
      setGossipNotification(`✍️ Настройки персонажа "${charName}" обновлены.`);
    } else {
      // Create new
      const newId = `custom-${Date.now()}`;
      const newChar: Character = {
        id: newId,
        name: charName.trim(),
        role: charRole.trim(),
        status: "В сети",
        avatarColor: ["from-pink-400 to-rose-600", "from-blue-400 to-indigo-600", "from-yellow-500 to-amber-700", "from-purple-400 to-fuchsia-600", "from-emerald-400 to-teal-700"][Math.floor(Math.random() * 5)],
        group: charGroup,
        personality: charPersonality.trim(),
        speechStyle: charSpeech.trim() || "Обычный разговорный живой язык мессенджеров.",
        attitude: charAttitude.trim() || "Нейтрально-любопытное.",
        initialMessage: charGreeting.trim() || "Привет! Рад(а) знакомству.",
        suggestedGreetings: [
          `Привет! Давно не виделись. Как дела?`,
          `Привет, ${charName}! Давай поболтаем?`
        ],
        scales: newScales,
        fetishes: newFetishes,
        inclinations: newInclinations
      };
      setCharacters(prev => [...prev, newChar]);
      setSelectedChatId(newId);
      setGossipNotification(`✨ Создан новый персонаж "${charName}"!`);
    }

    setShowCharModal(false);
    setEditingCharId(null);
    setTimeout(() => setGossipNotification(null), 3500);
  };

  // Group creation handler
  const handleCreateGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim() || selectedParticipants.length === 0) {
      setGossipNotification("⚠️ Ошибка: Укажите название группы и выберите хотя бы одного участника!");
      setTimeout(() => setGossipNotification(null), 4000);
      return;
    }

    const groupId = `group-${Date.now()}`;
    const newGroup: GroupChat = {
      id: groupId,
      name: groupName.trim(),
      avatarColor: ["from-teal-400 to-emerald-600", "from-fuchsia-500 to-purple-800", "from-orange-400 to-red-600", "from-sky-400 to-blue-600"][Math.floor(Math.random() * 4)],
      participantIds: selectedParticipants
    };

    setGroupChats(prev => [...prev, newGroup]);
    setSelectedChatId(groupId);
    setShowGroupModal(false);
    setGroupName("");
    setSelectedParticipants([]);

    setGossipNotification(`👥 Создан групповой чат "${newGroup.name}"!`);
    setTimeout(() => setGossipNotification(null), 4000);
  };

  // File attachments helper
  const triggerImageUpload = () => {
    fileInputRef.current?.click();
  };

  const handleImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const rawBase64 = reader.result as string;
        try {
          const compressed = await compressImage(rawBase64);
          setAttachedImage(compressed);
        } catch (err) {
          setAttachedImage(rawBase64);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Send message to Character or Group Chat
  const handleSendMessage = async (e: React.FormEvent, customText?: string, isFromCall = false) => {
    if (e) e.preventDefault();
    
    const textToSend = customText !== undefined ? customText : inputText;
    if ((!textToSend.trim() && !attachedImage) || isLoading) return;

    const currentText = textToSend.trim() || "Смотри прикрепленное изображение";
    const imageToSend = attachedImage;

    // Reset inputs immediately
    if (!isFromCall) {
      setInputText("");
      setAttachedImage(null);
      setSendAsNarrator(false); // Reset narrator toggle after send
    } else {
      setCallInputText("");
    }

    const isCallMode = isFromCall && activeCall?.type === "phone";
    const isLiveModeMessage = isFromCall && activeCall?.type === "in_person";

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: (customText === undefined && sendAsNarrator) ? "narrator" : "user",
      content: currentText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isVoice: isVoiceMode || isFromCall,
      isCall: isCallMode,
      isLive: isLiveModeMessage,
      image: imageToSend || undefined
    };

    // Update messages
    const currentHistory = messages[selectedChatId] || [];
    const updatedHistory = [...currentHistory, userMessage];
    setMessages(prev => ({
      ...prev,
      [selectedChatId]: updatedHistory
    }));

    setIsLoading(true);
    setSystemError(null);
    setSystemStatusMessage("ИИ анализирует контекст беседы...");

    try {
      // Determine responder details
      let responder: Character;
      let groupPartNames: string[] = [];

      if (activeGroup) {
        // Find which character responds in group
        const selectedResponderId = groupResponders[activeGroup.id] || "auto";
        let chosenId = selectedResponderId;

        if (chosenId === "auto") {
          // Select a random participant
          const idx = Math.floor(Math.random() * activeGroup.participantIds.length);
          chosenId = activeGroup.participantIds[idx];
        }

        const charObj = characters.find(c => c.id === chosenId);
        if (!charObj) throw new Error("Участник группы не найден.");
        responder = charObj;

        groupPartNames = activeGroupParticipants.map(p => `${p.name} (${p.role})`);
      } else {
        if (!activeChar) throw new Error("Собеседник не выбран.");
        responder = activeChar;
      }

      // Format character details
      const characterData = {
        name: responder.name,
        role: responder.role,
        personality: responder.personality,
        speechStyle: responder.speechStyle,
        attitude: responder.attitude,
        id: responder.id,
        group: responder.group,
        scales: responder.scales,
        fetishes: responder.fetishes,
        inclinations: responder.inclinations
      };

      // Facts
      const factsTexts = visibleFacts.map(f => f.text);

      // Call API
      setSystemStatusMessage("Отправка запроса в Gemini ИИ и генерация ответа...");
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          character: characterData,
          messages: updatedHistory,
          sharedFacts: factsTexts,
          isVoice: isVoiceMode || isFromCall,
          isCall: isCallMode,
          isLive: isLiveModeMessage,
          attachedImage: imageToSend,
          userProfile,
          groupParticipants: groupPartNames,
          aiMode: aiMode
        })
      });

      if (!response.ok) {
        throw new Error(`Ошибка сервера: ${response.status}`);
      }

      setSystemStatusMessage("Обновление шкал отношений и извлечение слухов...");
      const data = await response.json();

      // Form model message
      const modelMessage: Message = {
        id: `model-${Date.now()}`,
        role: "model",
        senderId: responder.id,
        content: data.reply || "*(Молчание собеседника...)*",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isVoice: isVoiceMode || isFromCall,
        isCall: isCallMode,
        isLive: isLiveModeMessage,
        image: data.generatedImage || undefined
      };

      // Set new chat state
      setMessages(prev => ({
        ...prev,
        [selectedChatId]: [...updatedHistory, modelMessage]
      }));

      // Update character states dynamically from communication
      setCharacters(prev => prev.map(c => {
        if (c.id === responder.id) {
          const status = data.dynamicStatus || c.status;
          const attitude = data.dynamicAttitude || c.attitude;
          
          let scales = c.scales ? { ...c.scales } : { trust: 50, love: 0, lust: 0, anger: 0 };
          if (data.scaleAdjustments) {
            const parseAdjustment = (val: any): number => {
              const parsed = parseInt(val);
              return isNaN(parsed) ? 0 : parsed;
            };
            const currentTrust = (scales.trust === undefined || isNaN(scales.trust)) ? 50 : scales.trust;
            const currentLove = (scales.love === undefined || isNaN(scales.love)) ? 0 : scales.love;
            const currentLust = (scales.lust === undefined || isNaN(scales.lust)) ? 0 : scales.lust;
            const currentAnger = (scales.anger === undefined || isNaN(scales.anger)) ? 0 : scales.anger;

            scales.trust = Math.min(100, Math.max(0, currentTrust + parseAdjustment(data.scaleAdjustments.trust)));
            scales.love = Math.min(100, Math.max(0, currentLove + parseAdjustment(data.scaleAdjustments.love)));
            scales.lust = Math.min(100, Math.max(0, currentLust + parseAdjustment(data.scaleAdjustments.lust)));
            scales.anger = Math.min(100, Math.max(0, currentAnger + parseAdjustment(data.scaleAdjustments.anger)));
          }

          return {
            ...c,
            status,
            attitude,
            scales
          };
        }
        return c;
      }));

      // Extract facts/gossips dynamically
      if (data.newSharedFacts && Array.isArray(data.newSharedFacts) && data.newSharedFacts.length > 0) {
        const addedFacts: SharedFact[] = [];
        data.newSharedFacts.forEach((factText: string) => {
          if (!sharedFacts.some(f => f.text.toLowerCase().trim() === factText.toLowerCase().trim())) {
            addedFacts.push({
              id: `extracted-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
              text: factText,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              sourceCharacterId: responder.id,
              group: responder.group
            });
          }
        });

        if (addedFacts.length > 0) {
          setSharedFacts(prev => [...addedFacts, ...prev]);
          setGossipNotification(`🤫 Слух утек в память: "${addedFacts[0].text}"`);
          setTimeout(() => setGossipNotification(null), 5000);
        }
      }

    } catch (err: any) {
      console.warn("Chat API error:", err?.message || err);
      setSystemError(err?.message || String(err));
      
      const errText = isFromCall 
        ? `[Связь прервалась из-за помех на линии с ${activeChar?.name || "собеседником"}]`
        : `*(Сообщение не доставлено. Кажется, пропала связь с собеседником. Ошибка ИИ сохранена в логах.)*`;
      
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: "model",
        content: errText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => ({
        ...prev,
        [selectedChatId]: [...updatedHistory, errorMessage]
      }));
    } finally {
      setIsLoading(false);
      setIsVoiceMode(false);
    }
  };

  // Compile Dynamic Storyteller Summary
  const refreshStoryteller = async (directive?: string) => {
    if (!userProfile) return;
    setIsStoryLoading(true);

    try {
      // Compile messages summary (recent conversations overview)
      let summaryText = "";
      Object.entries(messages as Record<string, Message[]>).forEach(([chatId, list]) => {
        const char = characters.find(c => c.id === chatId);
        const group = groupChats.find(g => g.id === chatId);
        const name = char ? char.name : (group ? `Группа "${group.name}"` : "Неизвестно");
        
        if (list && list.length > 0) {
          const lastFew = list.slice(-3);
          summaryText += `\n- Чат с ${name}:\n`;
          lastFew.forEach(m => {
            const who = m.role === "user" ? "Вы" : (char ? char.name : "Персонаж");
            summaryText += `  [${m.timestamp}] ${who}: ${m.content}\n`;
          });
        }
      });

      const response = await fetch("/api/storyteller", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userProfile,
          sharedFacts,
          messagesSummary: summaryText || "Диалоги пока пусты. Сюжет на этапе знакомства.",
          customDirective: directive,
          aiMode: aiMode
        })
      });

      if (!response.ok) throw new Error("Storyteller failed");

      const data = await response.json();
      const updatedLog: StoryLog = {
        storySummary: data.storySummary,
        keyChapters: data.keyChapters,
        lastUpdated: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + " " + new Date().toLocaleDateString()
      };

      setStoryLog(updatedLog);

      if (data.newSharedFacts && Array.isArray(data.newSharedFacts) && data.newSharedFacts.length > 0) {
        const addedFacts: SharedFact[] = [];
        data.newSharedFacts.forEach((factText: string) => {
          if (!sharedFacts.some(f => f.text.toLowerCase().trim() === factText.toLowerCase().trim())) {
            addedFacts.push({
              id: `storyteller-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
              text: factText,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              sourceCharacterId: "storyteller",
              group: "Все"
            });
          }
        });

        if (addedFacts.length > 0) {
          setSharedFacts(prev => [...addedFacts, ...prev]);
        }
      }

      setGossipNotification(directive ? "🎭 Воля Рассказчика воплощена в реальность!" : "🎭 Рассказчик обновил хронологию сюжета!");
      setTimeout(() => setGossipNotification(null), 3000);

    } catch (e) {
      console.log("Storyteller communication handled.");
      setGossipNotification("⚠️ Не удалось связаться с Рассказчиком. Попробуйте еще раз.");
      setTimeout(() => setGossipNotification(null), 4000);
    } finally {
      setIsStoryLoading(false);
    }
  };

  // Start Voice Call or Live Meeting Simulation
  const handleStartCall = (type: "phone" | "in_person" = "phone") => {
    if (!activeChar) return;
    setActiveCall({
      characterId: activeChar.id,
      status: "calling",
      duration: 0,
      type
    });

    // Simulate connection
    setTimeout(() => {
      setActiveCall(prev => {
        if (!prev) return null;
        return { ...prev, status: "connected" };
      });
    }, type === "in_person" ? 1500 : 2500);
  };

  // Hangup call / End in-person conversation
  const handleHangupCall = () => {
    if (activeCall) {
      const textDuration = `${Math.floor(activeCall.duration / 60)}м ${activeCall.duration % 60}с`;
      const isLive = activeCall.type === "in_person";
      const callLog: Message = {
        id: `call-log-${Date.now()}`,
        role: "model",
        content: isLive
          ? `🗣️ Личный разговор вживую завершен. Длительность беседы: ${textDuration}`
          : `📞 Телефонный разговор завершен. Длительность: ${textDuration}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isCall: !isLive,
        isLive: isLive
      };

      setMessages(prev => ({
        ...prev,
        [selectedChatId]: [...(prev[selectedChatId] || []), callLog]
      }));

      setActiveCall(null);
    }
  };

  // Suggested greeting trigger
  const handleSendSuggestedGreeting = (greetingText: string) => {
    handleSendMessage(null as any, greetingText);
  };

  // Pre-fill active chat messages list
  const currentChatMessages = useMemo(() => {
    return messages[selectedChatId] || [];
  }, [messages, selectedChatId]);

  // Determine if profile setup is required
  if (!userProfile) {
    return (
      <div id="profile-setup-screen" className="min-h-screen bg-neutral-950 text-neutral-100 font-sans flex items-center justify-center p-4 relative overflow-hidden bg-[radial-gradient(#1e1e1e_1px,transparent_1px)] [background-size:24px_24px]">
        <div className="absolute inset-0 bg-neutral-950/60 backdrop-blur-sm z-0"></div>
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className="w-full max-w-xl bg-neutral-900 border border-neutral-800 p-6 sm:p-8 rounded-3xl shadow-2xl relative z-10 overflow-hidden"
        >
          {isSavingProfile ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-8 text-center">
              <div className="relative">
                {/* Outer spin halo */}
                <div className="w-16 h-16 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
                {/* Inner reverse spin pulse */}
                <div className="absolute inset-2 border-2 border-purple-500/15 border-b-purple-500 rounded-full animate-spin [animation-duration:1.5s] [animation-direction:reverse]"></div>
                <div className="absolute inset-0 flex items-center justify-center font-black text-indigo-400 text-xs animate-pulse">ИИ</div>
              </div>

              <div className="space-y-2">
                <h2 className="text-lg font-extrabold text-neutral-100 animate-pulse tracking-wide">
                  Инициализация Сюжетной Линии
                </h2>
                <p className="text-xs text-neutral-400 max-w-xs leading-relaxed">
                  Пожалуйста, подождите. ИИ-система подготавливает вашу личность и рассчитывает стартовые параметры...
                </p>
              </div>

              {/* Stages Stagger Progress */}
              <div className="w-full max-w-sm bg-neutral-950/60 border border-neutral-800 p-5 rounded-2xl space-y-4 text-left">
                {[
                  { id: 1, title: "Чтение анкеты и характера ГГ", desc: "Анализ сильных и слабых сторон вашей личности" },
                  { id: 2, title: "Синхронизация уровня вожделения", desc: "Персонажи изучают вашу внешность и параметры" },
                  { id: 3, title: "Генерация стартового сюжета", desc: "Построение связей и подготовка истории" },
                  { id: 4, title: "Запуск игрового мира", desc: "Инициализация 21+ интерактивного окружения" }
                ].map((stage) => {
                  const isActive = setupStage === stage.id;
                  const isCompleted = setupStage > stage.id;
                  return (
                    <div key={stage.id} className="flex items-start gap-3 transition-opacity duration-300">
                      <div className="mt-0.5 shrink-0">
                        {isCompleted ? (
                          <div className="w-5 h-5 bg-green-500/20 border border-green-500 text-green-400 rounded-full flex items-center justify-center text-[10px] font-black">✓</div>
                        ) : isActive ? (
                          <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                          <div className="w-5 h-5 bg-neutral-900 border border-neutral-800 rounded-full flex items-center justify-center text-[9px] font-bold text-neutral-600">{stage.id}</div>
                        )}
                      </div>
                      <div>
                        <h4 className={`text-xs font-bold ${isActive ? "text-indigo-400 animate-pulse" : isCompleted ? "text-neutral-300 line-through opacity-75" : "text-neutral-500"}`}>
                          {stage.title}
                        </h4>
                        <p className="text-[10px] text-neutral-500 leading-tight">{stage.desc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <>
              {/* Glowing Accents */}
              <div className="absolute top-0 left-1/4 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl"></div>
              <div className="absolute bottom-0 right-1/4 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl"></div>

              <div className="text-center mb-6 space-y-2">
                <div className="mx-auto w-12 h-12 bg-gradient-to-tr from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-purple-900/30">
                  <User className="w-6 h-6 text-white" />
                </div>
                <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight bg-gradient-to-r from-neutral-50 via-neutral-200 to-neutral-400 bg-clip-text text-transparent">
                  Инициализация Вашей Личности
                </h1>
                <p className="text-xs text-neutral-400 leading-relaxed max-w-sm mx-auto">
                  Перед началом ролевой переписки настройте своего главного героя. Персонажи ИИ будут реагировать на ваше имя, пол, возраст и черты характера!
                </p>
              </div>

              <form onSubmit={handleSaveProfile} className="space-y-4 text-sm">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-neutral-400 mb-1.5 uppercase">Ваше имя (Никнейм) *</label>
                <input
                  type="text"
                  required
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  placeholder="Например: Влад, Кристина"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-neutral-100 placeholder-neutral-700 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-400 mb-1.5 uppercase">Возраст *</label>
                <input
                  type="number"
                  required
                  min={18}
                  max={99}
                  value={profileAge}
                  onChange={(e) => setProfileAge(parseInt(e.target.value) || 20)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-neutral-100 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 font-medium"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-400 mb-1.5 uppercase">Ваш пол *</label>
              <div className="flex items-center gap-2.5 bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-neutral-200 font-semibold text-xs select-none">
                <span className="text-rose-500 font-extrabold text-sm">♀</span> Женский (Сюжет разыгрывается от лица девушки)
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-xs font-bold text-neutral-400 uppercase">Уровень привлекательности главной героини: <span className="text-rose-400 font-extrabold">{profileAttractiveness}%</span></label>
                <span className="text-[10px] text-rose-300 font-semibold">
                  {profileAttractiveness >= 85 ? "🔥 Сногсшибательная" : profileAttractiveness >= 65 ? "✨ Привлекательная" : profileAttractiveness >= 40 ? "😊 Обычная" : "🥶 Невзрачная"}
                </span>
              </div>
              <div className="flex items-center gap-4 bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={profileAttractiveness}
                  onChange={(e) => setProfileAttractiveness(parseInt(e.target.value))}
                  className="flex-1 accent-rose-500 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
                />
                <span className="text-xs font-black text-rose-400 w-8 text-right">{profileAttractiveness}%</span>
              </div>
              <p className="text-[10px] text-neutral-500 mt-1 leading-normal">
                Позволяет наглядно настроить базовое вожделение и силу реакций всех мужских персонажей в игре на вашу внешность.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-400 mb-1.5 uppercase">Черты характера (через запятую) *</label>
              <input
                type="text"
                required
                value={profileTraits}
                onChange={(e) => setProfileTraits(e.target.value)}
                placeholder="Саркастичный, скромный, прямолинейный, отзывчивый"
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-neutral-100 placeholder-neutral-700 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-400 mb-1.5 uppercase">Короткая Биография / Род Деятельности *</label>
              <textarea
                required
                rows={3}
                value={profileBio}
                onChange={(e) => setProfileBio(e.target.value)}
                placeholder="Студент-программист, подрабатываю в кофейне, живу отдельно от родителей за городом."
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-neutral-100 placeholder-neutral-700 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {/* Photo Upload Box */}
            <div className="border-t border-neutral-800/60 pt-4 space-y-3">
              <div className="flex items-center gap-1.5 text-indigo-400">
                <Camera className="w-4 h-4 text-indigo-400" />
                <span className="text-xs font-bold uppercase tracking-wider">Фотография вашего героя *</span>
              </div>
              <p className="text-[11px] text-neutral-400 leading-relaxed">
                Загрузите фото для автоматической оценки ИИ. <strong className="text-amber-400">Без фото вожделение персонажей начнется с 0%</strong> и не будет расти, пока вы не загрузите снимок!
              </p>

              <div className="flex flex-col items-center justify-center border-2 border-dashed border-neutral-800 hover:border-indigo-500/50 bg-neutral-950/40 p-5 rounded-2xl transition-all relative">
                {isEvaluatingPhoto ? (
                  <div className="py-6 flex flex-col items-center space-y-3">
                    <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-xs text-neutral-300 font-bold animate-pulse">ИИ изучает контуры лица и тела...</p>
                    <p className="text-[9px] text-neutral-500 text-center">Это займет всего пару секунд для точной оценки</p>
                  </div>
                ) : (
                  <>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handlePhotoUploadAndEvaluation(file);
                      }}
                      className="hidden"
                      id="initial-photo-upload"
                    />
                    {profilePhoto ? (
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-24 h-24 rounded-2xl overflow-hidden border border-neutral-700 shadow-md">
                          <img src={profilePhoto} alt="Hero avatar" className="w-full h-full object-cover" />
                        </div>
                        <div className="flex gap-2">
                          <label
                            htmlFor="initial-photo-upload"
                            className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-bold rounded-xl cursor-pointer transition-all"
                          >
                            Заменить фото
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              setProfilePhoto(null);
                              // Reset parameters
                              setProfileFace("Привлекательное, чистое лицо");
                              setProfileChest("Упругая, округлая грудь");
                              setProfileWaist("Тонкая талия, плоский живот");
                              setProfileHips("Выразительные, округлые бёдра");
                              setProfileIntimate("Аккуратные, ухоженные интимные зоны");
                              setProfileLegs("Стройные, длинные ноги");
                              setProfileOverall("Здоровое, спортивное и ухоженное тело без уродств");
                            }}
                            className="px-3 py-1.5 bg-red-950/40 hover:bg-red-900/40 text-red-300 text-xs font-bold rounded-xl cursor-pointer border border-red-900/30 transition-all"
                          >
                            Удалить
                          </button>
                        </div>
                      </div>
                    ) : (
                      <label
                        htmlFor="initial-photo-upload"
                        className="w-full flex flex-col items-center justify-center py-4 cursor-pointer"
                      >
                        <Upload className="w-8 h-8 text-neutral-600 mb-2 group-hover:text-indigo-400" />
                        <span className="text-xs font-bold text-neutral-300">Нажмите для выбора снимка</span>
                        <span className="text-[10px] text-neutral-500 mt-1">Поддерживаются PNG, JPG до 5МБ</span>
                      </label>
                    )}
                  </>
                )}
              </div>

              {evaluationError && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-[11px] text-amber-400 leading-relaxed text-left">
                  ⚠️ {evaluationError}
                </div>
              )}
            </div>

            {/* Appearance Section */}
            <div className="border-t border-neutral-800/60 pt-4 space-y-3">
              <div className="flex items-center gap-1.5 text-rose-400">
                <span>🍓</span>
                <span className="text-xs font-bold uppercase tracking-wider">Объективная Внешность (Влияет на вожделение)</span>
              </div>
              <p className="text-[11px] text-neutral-400 leading-relaxed">
                Персонажи со склонностью к вожделению оценивают ваше тело. При уродствах, болезнях или бесформенности их влечение к вам не будет расти. Вы можете изменить параметры ниже, если автоматическая оценка не сработала.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-neutral-400 mb-1 uppercase">Лицо *</label>
                  <input
                    type="text"
                    required
                    value={profileFace}
                    onChange={(e) => setProfileFace(e.target.value)}
                    placeholder="Симметричное, чистое лицо"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-100 placeholder-neutral-700 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-neutral-400 mb-1 uppercase">Грудь / Бюст *</label>
                  <input
                    type="text"
                    required
                    value={profileChest}
                    onChange={(e) => setProfileChest(e.target.value)}
                    placeholder="Упругая, округлая грудь"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-100 placeholder-neutral-700 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-neutral-400 mb-1 uppercase">Талия *</label>
                  <input
                    type="text"
                    required
                    value={profileWaist}
                    onChange={(e) => setProfileWaist(e.target.value)}
                    placeholder="Тонкая талия, плоский живот"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-100 placeholder-neutral-700 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-neutral-400 mb-1 uppercase">Бёдра *</label>
                  <input
                    type="text"
                    required
                    value={profileHips}
                    onChange={(e) => setProfileHips(e.target.value)}
                    placeholder="Выразительные, округлые бёдра"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-100 placeholder-neutral-700 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-neutral-400 mb-1 uppercase">Интимные зоны *</label>
                  <input
                    type="text"
                    required
                    value={profileIntimate}
                    onChange={(e) => setProfileIntimate(e.target.value)}
                    placeholder="Аккуратные интимные зоны"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-100 placeholder-neutral-700 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-neutral-400 mb-1 uppercase">Ноги *</label>
                  <input
                    type="text"
                    required
                    value={profileLegs}
                    onChange={(e) => setProfileLegs(e.target.value)}
                    placeholder="Стройные, длинные ноги"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-100 placeholder-neutral-700 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-neutral-400 mb-1 uppercase">Общее состояние, здоровье, дефекты или уродства *</label>
                <textarea
                  required
                  rows={2}
                  value={profileOverall}
                  onChange={(e) => setProfileOverall(e.target.value)}
                  placeholder="Спортивная форма, здоровая кожа, без уродств"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-100 placeholder-neutral-700 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {/* AI Detailed Analysis under physical traits */}
            {(profileDetailedAnalysis || profileImageSceneDescription || profilePlotContext) && (
              <div className="border-t border-neutral-800/60 pt-4 space-y-4 text-left">
                <div className="flex items-center gap-1.5 text-indigo-400">
                  <span>🔮</span>
                  <span className="text-xs font-bold uppercase tracking-wider">Углубленный ИИ-Анализ Внешности и Сюжета</span>
                </div>
                
                <div className="space-y-3">
                  {profileDetailedAnalysis && (
                    <div className="bg-indigo-950/25 border border-indigo-900/30 p-3.5 rounded-xl space-y-1">
                      <span className="font-bold text-[9px] text-indigo-300 uppercase tracking-wider block">🎨 Психофизический Анализ & Харизма:</span>
                      <p className="text-neutral-300 text-xs leading-relaxed whitespace-pre-wrap">{profileDetailedAnalysis}</p>
                    </div>
                  )}

                  {profileImageSceneDescription && (
                    <div className="bg-purple-950/25 border border-purple-900/30 p-3.5 rounded-xl space-y-1">
                      <span className="font-bold text-[9px] text-purple-300 uppercase tracking-wider block">📸 Описание сцены & одежды на фото:</span>
                      <p className="text-neutral-300 text-xs leading-relaxed whitespace-pre-wrap">{profileImageSceneDescription}</p>
                    </div>
                  )}

                  {profilePlotContext && (
                    <div className="bg-rose-950/25 border border-rose-900/30 p-3.5 rounded-xl space-y-1">
                      <span className="font-bold text-[9px] text-rose-300 uppercase tracking-wider block">📖 Влияние на Сюжет & Реакции Окружающих:</span>
                      <p className="text-neutral-300 text-xs leading-relaxed whitespace-pre-wrap">{profilePlotContext}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {profileFormError && (
              <div className="p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 font-semibold text-center select-none animate-pulse">
                ⚠️ {profileFormError}
              </div>
            )}

            <div className="pt-2">
              <button
                type="submit"
                disabled={isSavingProfile}
                className={`w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl font-bold tracking-wide shadow-lg shadow-purple-950/40 transition-all flex items-center justify-center gap-2 ${
                  isSavingProfile ? "opacity-75 cursor-not-allowed" : "cursor-pointer active:scale-[0.99]"
                }`}
              >
                {isSavingProfile ? (
                  <>
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Инициализация сюжетной линии...</span>
                  </>
                ) : (
                  <>
                    <span>Начать Сюжетную Игру 🚀</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </>
      )}
    </motion.div>
      </div>
    );
  }

  return (
    <div id="app-root" className="min-h-screen bg-neutral-950 text-neutral-100 font-sans flex flex-col overflow-hidden relative">
      
      {/* Visual Overlay Notifications */}
      <AnimatePresence>
        {gossipNotification && (
          <motion.div
            initial={{ opacity: 0, y: -50, scale: 0.9 }}
            animate={{ opacity: 1, y: 16, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-amber-500/90 text-neutral-950 px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 backdrop-blur-md max-w-md border border-amber-300 font-semibold text-xs"
          >
            <Radio className="w-5 h-5 animate-pulse shrink-0" />
            <div>{gossipNotification}</div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main App Header */}
      <header className="border-b border-neutral-800 bg-neutral-900/50 backdrop-blur-md px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg shadow-purple-500/20 shrink-0">
            <MessageSquare className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xs sm:text-sm font-bold tracking-tight text-white flex items-center gap-1.5">
              <span className="hidden xs:inline">Интерактивная</span> ролевая переписка
              <span className="hidden sm:inline-block text-[10px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded-full font-mono font-medium">v2.0</span>
            </h1>
            <p className="hidden sm:flex text-[10px] text-neutral-400 items-center gap-1.5 select-none mt-0.5">
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${isLoading ? "bg-amber-400 animate-ping" : "bg-emerald-500 animate-pulse"}`}></span>
              <span>{isLoading ? `ИИ-Анализ и Генерация...` : "Система: Активна и в порядке"}</span>
            </p>
          </div>
        </div>

        {/* Global Controls */}
        <div className="flex items-center gap-2">
          <div className="relative shrink-0">
            <select
              value={aiMode}
              onChange={(e) => setAiMode(e.target.value as any)}
              className="bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 rounded-lg px-2 py-1.5 text-[10px] sm:text-xs font-semibold text-neutral-300 focus:outline-none focus:border-indigo-500 cursor-pointer"
              title="Режим искусственного интеллекта"
            >
              <option value="standard">🤖 Обычный (Flash)</option>
              <option value="high_thinking">🧠 Мышление (Pro)</option>
              <option value="low_latency">⚡ Быстрый (Lite)</option>
            </select>
          </div>

          <button
            onClick={openEditProfile}
            title="Ваш Профиль"
            className="hidden md:flex items-center gap-1 px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 text-xs font-semibold rounded-lg border border-neutral-800 transition-all cursor-pointer"
          >
            <User className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden sm:inline">Герой: {userProfile?.name}</span>
          </button>

          <button
            onClick={handleResetData}
            title="Начать всё сначала"
            className="hidden md:flex items-center gap-1.5 px-3 py-1.5 bg-red-600/10 hover:bg-red-600/20 border border-red-500/20 text-red-400 text-xs font-semibold rounded-lg transition-all cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Начать заново</span>
          </button>
        </div>
      </header>

      {/* Main Content Dashboard */}
      <div className="flex-1 flex overflow-hidden relative">
        
        {/* PANEL 1: Left Column - Character Selection & Settings */}
        <aside className="w-80 border-r border-neutral-800 bg-neutral-900/30 flex flex-col shrink-0 hidden md:flex">
          
          {/* Navigation Tab Header (Inside Sidebar for Desktop) */}
          <div className="p-4 border-b border-neutral-800/60 flex flex-col gap-3">
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">
              Ваше сюжетное пространство
            </span>
            <div className="grid grid-cols-3 gap-1 p-1 bg-neutral-950 rounded-lg border border-neutral-800/50">
              <button
                onClick={() => { setActiveTab("chat"); }}
                className={`py-1.5 text-[11px] font-medium rounded-md transition-all cursor-pointer ${
                  activeTab === "chat" 
                    ? "bg-neutral-800 text-white shadow-sm font-semibold" 
                    : "text-neutral-400 hover:text-neutral-200"
                }`}
              >
                Чаты
              </button>
              <button
                onClick={() => { setActiveTab("story"); }}
                className={`py-1.5 text-[11px] font-medium rounded-md transition-all cursor-pointer ${
                  activeTab === "story" 
                    ? "bg-neutral-800 text-white shadow-sm font-semibold" 
                    : "text-neutral-400 hover:text-neutral-200"
                }`}
              >
                Сюжет
              </button>
              <button
                onClick={() => { setActiveTab("lore"); }}
                className={`py-1.5 text-[11px] font-medium rounded-md transition-all cursor-pointer ${
                  activeTab === "lore" 
                    ? "bg-neutral-800 text-white shadow-sm font-semibold" 
                    : "text-neutral-400 hover:text-neutral-200"
                }`}
              >
                Сплетни
              </button>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => openCharacterModal(null)}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold rounded-lg shadow-sm transition-all cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Персонаж</span>
              </button>
              <button
                onClick={() => { setShowGroupModal(true); }}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-neutral-800 hover:bg-neutral-750 text-neutral-200 text-[10px] font-bold rounded-lg shadow-sm transition-all border border-neutral-700 cursor-pointer"
              >
                <Users className="w-3.5 h-3.5" />
                <span>+ Группа</span>
              </button>
            </div>
          </div>

          {/* Chat list viewport */}
          <div className="flex-1 overflow-y-auto p-2 space-y-3 custom-scrollbar">
            
            {/* Group Chats Section */}
            {groupChats.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[10px] font-bold text-neutral-500 px-2 uppercase tracking-wider flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-neutral-500" />
                  <span>Групповые беседы ({groupChats.length})</span>
                </div>
                {groupChats.map(group => {
                  const isSelected = group.id === selectedChatId;
                  const chatMsgs = messages[group.id] || [];
                  const lastMsg = chatMsgs[chatMsgs.length - 1];

                  return (
                    <button
                      key={group.id}
                      onClick={() => {
                        setSelectedChatId(group.id);
                        setActiveTab("chat");
                      }}
                      className={`w-full text-left p-2.5 rounded-xl flex items-start gap-3 transition-all cursor-pointer relative ${
                        isSelected
                          ? "bg-indigo-600/15 border border-indigo-500/25 shadow-md shadow-indigo-950/20"
                          : "hover:bg-neutral-800/40 border border-transparent"
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-tr ${group.avatarColor} flex items-center justify-center text-white font-extrabold text-sm shadow-md shrink-0`}>
                        {group.name.substring(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs text-neutral-100 truncate">
                            {group.name}
                          </span>
                          <span className="text-[9px] text-neutral-500 shrink-0">
                            {lastMsg ? lastMsg.timestamp : ""}
                          </span>
                        </div>
                        <p className="text-[11px] text-neutral-400 truncate mt-0.5">
                          {lastMsg ? lastMsg.content : "Сообщений нет. Начните диалог первым!"}
                        </p>
                        <span className="text-[9px] bg-neutral-850 text-indigo-400 px-1.5 py-0.5 rounded-md mt-1 inline-block">
                          👥 Участников: {group.participantIds.length}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Private Chats Section */}
            <div className="space-y-1.5">
              <div className="text-[10px] font-bold text-neutral-500 px-2 uppercase tracking-wider flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-neutral-500" />
                <span>Личные переписки ({characters.length})</span>
              </div>
              
              {characters.length === 0 ? (
                <div className="text-center p-4 text-xs text-neutral-600">Нет персонажей. Создайте своего!</div>
              ) : (
                characters.map(char => {
                  const isSelected = char.id === selectedChatId;
                  const charMsgs = messages[char.id] || [];
                  const lastMsg = charMsgs[charMsgs.length - 1];

                  return (
                    <button
                      key={char.id}
                      onClick={() => {
                        setSelectedChatId(char.id);
                        setActiveTab("chat");
                      }}
                      className={`w-full text-left p-2.5 rounded-xl flex items-start gap-3 transition-all cursor-pointer relative ${
                        isSelected
                          ? "bg-indigo-600/15 border border-indigo-500/25 shadow-md shadow-indigo-950/20"
                          : "hover:bg-neutral-800/40 border border-transparent"
                      }`}
                    >
                      {/* Status Ring Avatar */}
                      <div className="relative shrink-0">
                        <div className={`w-10 h-10 rounded-xl bg-gradient-to-tr ${char.avatarColor} flex items-center justify-center text-white font-bold text-base shadow-md`}>
                          {char.name[0]}
                        </div>
                        {/* Status dot */}
                        <span className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-neutral-900 ${
                          char.status === "В сети" ? "bg-emerald-500" :
                          char.status === "Занят" ? "bg-amber-500" :
                          char.status === "Играет" ? "bg-purple-500" :
                          char.status === "Печатает..." ? "bg-cyan-500 animate-pulse" : "bg-neutral-500"
                        }`} title={char.status}></span>
                      </div>

                      {/* Character Meta */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs text-neutral-100 truncate">
                            {char.name}
                          </span>
                          <span className="text-[9px] text-neutral-500 shrink-0">
                            {lastMsg ? lastMsg.timestamp : ""}
                          </span>
                        </div>
                        <div className="text-[10px] text-indigo-400 font-semibold truncate leading-none mt-0.5">
                          {char.role}
                        </div>
                        <p className="text-[11px] text-neutral-400 truncate mt-1">
                          {lastMsg ? lastMsg.content : "Диалог пуст. Напишите что-нибудь..."}
                        </p>
                        
                        {/* Extra Pills */}
                        <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                          <span className="text-[8px] bg-neutral-850 text-neutral-400 px-1.5 py-0.5 rounded border border-neutral-800">
                            {char.group}
                          </span>
                          <span className="text-[8px] bg-amber-500/10 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/15 truncate max-w-[120px]">
                            {char.attitude}
                          </span>
                          {char.scales && (
                            <>
                              {char.scales.love > 0 && (
                                <span className="text-[8px] bg-rose-500/10 text-rose-300 px-1.5 py-0.5 rounded border border-rose-500/15 font-bold" title={`Любовь: ${char.scales.love}%`}>
                                  ❤️ {char.scales.love}%
                                </span>
                              )}
                              {char.scales.lust > 0 && (
                                <span className="text-[8px] bg-purple-500/10 text-purple-300 px-1.5 py-0.5 rounded border border-purple-500/15 font-bold" title={`Вожделение: ${char.scales.lust}%`}>
                                  🔥 {char.scales.lust}%
                                </span>
                              )}
                              {char.scales.anger > 0 && (
                                <span className="text-[8px] bg-red-500/10 text-red-300 px-1.5 py-0.5 rounded border border-red-500/15 font-bold" title={`Гнев: ${char.scales.anger}%`}>
                                  ⚡ {char.scales.anger}%
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

          </div>

          {/* Quick info panel at bottom of sidebar */}
          <div className="p-4 border-t border-neutral-800/60 bg-neutral-900/10 text-[10px] text-neutral-500 flex flex-col gap-1.5">
            <div className="flex items-center gap-1 text-neutral-400">
              <Info className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span className="font-semibold">Персонаж Начинает Вторым</span>
            </div>
            <p>Диалоги теперь чисты по умолчанию. Ваше первое слово и личность игрока задают тон всей ролевой ветке.</p>
          </div>
        </aside>

        {/* PANEL 2: Central Column - Chat View or Scenario deck */}
        <main className="flex-1 flex flex-col bg-neutral-950 overflow-hidden relative">
          
          {/* Mobile Bottom Tab Selection for small screen devices */}
          <div className="md:hidden flex border-b border-neutral-800 p-1 bg-neutral-900/50 shrink-0">
            <button
              onClick={() => setActiveTab("chat")}
              className={`flex-1 py-1.5 text-[10px] font-semibold rounded-lg flex flex-col items-center gap-0.5 transition-all ${
                activeTab === "chat" ? "bg-neutral-800 text-white" : "text-neutral-400"
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Чаты</span>
            </button>
            <button
              onClick={() => setActiveTab("story")}
              className={`flex-1 py-1.5 text-[10px] font-semibold rounded-lg flex flex-col items-center gap-0.5 transition-all ${
                activeTab === "story" ? "bg-neutral-800 text-white" : "text-neutral-400"
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Сюжет</span>
            </button>
            <button
              onClick={() => setActiveTab("lore")}
              className={`flex-1 py-1.5 text-[10px] font-semibold rounded-lg flex flex-col items-center gap-0.5 transition-all ${
                activeTab === "lore" ? "bg-neutral-800 text-white" : "text-neutral-400"
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              <span>Сплетни</span>
            </button>
            <button
              onClick={() => setActiveTab("profile")}
              className={`flex-1 py-1.5 text-[10px] font-semibold rounded-lg flex flex-col items-center gap-0.5 transition-all ${
                activeTab === "profile" ? "bg-neutral-800 text-white" : "text-neutral-400"
              }`}
            >
              <User className="w-3.5 h-3.5 text-indigo-400" />
              <span>Профиль</span>
            </button>
          </div>

          {activeTab === "chat" ? (
            /* --- ACTIVE VIEW: CHAT INTERFACE --- */
            <div className="flex-1 flex flex-col overflow-hidden relative">
              
              {/* Horizontal Chat Selector for Mobile (visible only on mobile) */}
              <div className="md:hidden flex items-center gap-2.5 p-2 bg-neutral-950 border-b border-neutral-850 overflow-x-auto shrink-0 scrollbar-none select-none">
                {/* Create Actions inside mobile menu */}
                <button
                  onClick={() => openCharacterModal(null)}
                  title="Добавить персонажа"
                  className="w-9 h-9 rounded-xl bg-neutral-900 hover:bg-neutral-850 flex items-center justify-center text-indigo-400 border border-neutral-800 shrink-0 cursor-pointer active:scale-95 transition-all"
                >
                  <Plus className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setShowGroupModal(true)}
                  title="Создать группу"
                  className="w-9 h-9 rounded-xl bg-neutral-900 hover:bg-neutral-850 flex items-center justify-center text-indigo-400 border border-neutral-800 shrink-0 cursor-pointer active:scale-95 transition-all"
                >
                  <Users className="w-4 h-4" />
                </button>
                <div className="w-[1px] h-6 bg-neutral-800 shrink-0 mx-1"></div>

                {groupChats.map(group => {
                  const isSelected = group.id === selectedChatId;
                  return (
                    <button
                      key={group.id}
                      onClick={() => setSelectedChatId(group.id)}
                      className={`relative shrink-0 flex flex-col items-center gap-0.5 p-1 rounded-xl transition-all cursor-pointer ${
                        isSelected 
                          ? "bg-indigo-600/15 border border-indigo-500/25 text-white" 
                          : "border border-transparent text-neutral-400 hover:text-neutral-200"
                      }`}
                    >
                      <div className={`w-9 h-9 rounded-xl bg-gradient-to-tr ${group.avatarColor} flex items-center justify-center text-white font-extrabold text-[10px] shadow-sm`}>
                        {group.name.substring(0, 2).toUpperCase()}
                      </div>
                      <span className="text-[8px] max-w-[45px] truncate font-semibold mt-0.5">
                        {group.name}
                      </span>
                    </button>
                  );
                })}

                {characters.map(char => {
                  const isSelected = char.id === selectedChatId;
                  return (
                    <button
                      key={char.id}
                      onClick={() => setSelectedChatId(char.id)}
                      className={`relative shrink-0 flex flex-col items-center gap-0.5 p-1 rounded-xl transition-all cursor-pointer ${
                        isSelected 
                          ? "bg-indigo-600/15 border border-indigo-500/25 text-white" 
                          : "border border-transparent text-neutral-400 hover:text-neutral-200"
                      }`}
                    >
                      <div className={`w-9 h-9 rounded-xl bg-gradient-to-tr ${char.avatarColor} flex items-center justify-center text-white font-bold text-[12px] shadow-sm relative`}>
                        {char.name[0]}
                        <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-neutral-900 ${
                          char.status === "В сети" ? "bg-emerald-500" :
                          char.status === "Занят" ? "bg-amber-500" :
                          char.status === "Играет" ? "bg-purple-500" :
                          char.status === "Печатает..." ? "bg-cyan-500 animate-pulse" : "bg-neutral-500"
                        }`}></span>
                      </div>
                      <span className="text-[8px] max-w-[45px] truncate font-semibold mt-0.5">
                        {char.name}
                      </span>
                    </button>
                  );
                })}
              </div>
              
              {/* Chat Header */}
              <div className="px-4 py-2.5 border-b border-neutral-800 bg-neutral-900/20 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  {activeGroup ? (
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-tr ${activeGroup.avatarColor} flex items-center justify-center text-white font-extrabold text-sm shadow-md`}>
                      {activeGroup.name.substring(0, 2).toUpperCase()}
                    </div>
                  ) : (
                    activeChar && (
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-tr ${activeChar.avatarColor} flex items-center justify-center text-white font-bold text-base shadow-md`}>
                        {activeChar.name[0]}
                      </div>
                    )
                  )}

                  <div className="min-w-0">
                    <h2 className="font-bold text-xs text-neutral-50 flex items-center gap-1.5">
                      {activeGroup ? activeGroup.name : activeChar?.name}
                      <span className="text-[9px] px-2 py-0.5 bg-neutral-850 border border-neutral-800 text-neutral-400 rounded-full font-normal">
                        {activeGroup ? "Групповой чат" : activeChar?.role}
                      </span>
                    </h2>
                    
                    <div className="text-[10px] text-neutral-400 flex items-center gap-1 mt-0.5 truncate">
                      {activeGroup ? (
                        <>
                          <Users className="w-3 h-3 text-neutral-500 shrink-0" />
                          <span className="truncate">Участники: {activeGroupParticipants.map(p => p.name).join(", ")}</span>
                        </>
                      ) : (
                        activeChar && (
                          <>
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                            <span>{activeChar.status}</span>
                            <span className="text-neutral-700">•</span>
                            <span className="text-indigo-400 font-semibold">{activeChar.attitude}</span>
                          </>
                        )
                      )}
                    </div>
                  </div>
                </div>

                {/* Header Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setShowChatSwitcherModal(true)}
                    className="px-2.5 py-1.5 sm:px-3 bg-indigo-600/15 border border-indigo-500/30 hover:bg-indigo-600/25 text-indigo-400 rounded-xl flex items-center gap-1.5 cursor-pointer font-bold select-none transition-all text-[11px] sm:text-xs"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span className="hidden xs:inline">Все чаты</span>
                    <span className="inline xs:hidden">Чаты</span>
                  </button>

                  {activeChar && (
                    <>
                      {/* Dossier Button */}
                      <button
                        onClick={() => setShowCharInfoModal(true)}
                        title={`Показать досье и характеристики ${activeChar.name}`}
                        className="px-2.5 py-1.5 bg-indigo-600/15 hover:bg-indigo-600/30 border border-indigo-500/35 text-indigo-400 hover:text-indigo-300 rounded-xl transition-all cursor-pointer flex items-center gap-1 font-semibold text-[11px] sm:text-xs select-none animate-pulse"
                      >
                        <User className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Досье</span>
                      </button>

                      {/* Thoughts Button */}
                      <button
                        onClick={handleFetchThoughts}
                        title={`Узнать мысли и скрытые мотивы ${activeChar.name}`}
                        className="px-2.5 py-1.5 bg-purple-600/15 hover:bg-purple-600/30 border border-purple-500/35 text-purple-400 hover:text-purple-300 rounded-xl transition-all cursor-pointer flex items-center gap-1 font-semibold text-[11px] sm:text-xs select-none"
                      >
                        <Brain className="w-3.5 h-3.5 animate-pulse text-purple-400" />
                        <span>Мысли</span>
                      </button>

                      {/* Call Trigger Button */}
                      <button
                        onClick={() => handleStartCall("phone")}
                        title={`Позвонить ${activeChar.name}`}
                        className="p-2 bg-indigo-600/10 hover:bg-indigo-600/25 border border-indigo-500/20 text-indigo-400 hover:text-indigo-300 rounded-xl transition-all cursor-pointer"
                      >
                        <Phone className="w-4 h-4" />
                      </button>

                      {/* Live In-person Talk Trigger Button */}
                      <button
                        onClick={() => handleStartCall("in_person")}
                        title={`Разговор вживую с ${activeChar.name} (отыгрыш встречи)`}
                        className="p-2 bg-emerald-600/10 hover:bg-emerald-600/25 border border-emerald-500/20 text-emerald-400 hover:text-emerald-300 rounded-xl transition-all cursor-pointer"
                      >
                        <Users className="w-4 h-4 text-emerald-400" />
                      </button>

                      {/* Manual Edit Button */}
                      <button
                        onClick={() => openCharacterModal(activeChar.id)}
                        title="Настроить характер персонажа вручную"
                        className="p-2 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-400 hover:text-white rounded-xl transition-all cursor-pointer"
                      >
                        <PenSquare className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Chat Message Bubble Viewport */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-[radial-gradient(#1e1e1e_1px,transparent_1px)] [background-size:16px_16px]">
                
                {/* System Error & Diagnostics Dashboard Banner */}
                {systemError && (
                  <div className="max-w-xl mx-auto my-3 bg-red-950/45 border border-red-900/60 p-4 rounded-2xl text-left space-y-2 backdrop-blur-md relative overflow-hidden shadow-xl shadow-red-950/20">
                    <div className="absolute top-0 right-0 p-2">
                      <button 
                        onClick={() => setSystemError(null)} 
                        className="text-red-400 hover:text-white transition-all cursor-pointer"
                        title="Закрыть уведомление"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-red-500/10 rounded-xl text-red-400 shrink-0 mt-0.5">
                        <AlertTriangle className="w-5 h-5 animate-bounce" />
                      </div>
                      <div className="space-y-1 pr-6">
                        <h4 className="font-bold text-xs text-red-200">⚠️ Неполадка в ИИ-подсистеме (Диагностика)</h4>
                        <p className="text-[11px] text-neutral-300 leading-relaxed">
                          Нейросеть вернула ошибку при генерации ответа. Проверьте диагностические данные ниже:
                        </p>
                        <div className="mt-2 bg-neutral-950/80 rounded-lg p-2.5 border border-red-900/30 font-mono text-[9px] text-rose-300 select-all overflow-x-auto max-h-32 custom-scrollbar">
                          {systemError}
                        </div>
                        <p className="text-[10px] text-neutral-400 leading-normal pt-1.5">
                          💡 **Что делать:** Вероятно, превышена квота или отсутствует ключ API. Убедитесь, что `GEMINI_API_KEY` задан в панели Secrets в AI Studio.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Character/Group context card */}
                <div className="bg-neutral-900/40 border border-neutral-800/80 p-4 rounded-2xl max-w-xl mx-auto my-3 text-center flex flex-col items-center gap-2 backdrop-blur-md">
                  {activeGroup ? (
                    <>
                      <div className={`w-14 h-14 rounded-2xl bg-gradient-to-tr ${activeGroup.avatarColor} flex items-center justify-center text-white font-extrabold text-xl shadow-lg shadow-neutral-950`}>
                        {activeGroup.name.substring(0, 2).toUpperCase()}
                      </div>
                      <h3 className="font-bold text-sm mt-1">{activeGroup.name}</h3>
                      <p className="text-[10px] text-indigo-400 font-semibold">Групповое сюжетное приключение</p>
                      <p className="text-xs text-neutral-400 leading-relaxed max-w-sm mt-1">
                        Вы общаетесь в группе с несколькими ИИ-персонажами одновременно. Выбирайте, кто ответит на ваше сообщение, или запрашивайте реплики по очереди!
                      </p>
                    </>
                  ) : (
                    activeChar && (
                      <>
                        <div className={`w-14 h-14 rounded-2xl bg-gradient-to-tr ${activeChar.avatarColor} flex items-center justify-center text-white font-extrabold text-xl shadow-lg shadow-neutral-950`}>
                          {activeChar.name[0]}
                        </div>
                        <h3 className="font-bold text-sm mt-1">{activeChar.name}</h3>
                        <p className="text-[10px] text-indigo-400 font-semibold">{activeChar.role} • Круг «{activeChar.group}»</p>
                        
                        <div className="text-xs text-neutral-400 max-w-md mt-2 leading-relaxed space-y-1.5 text-left w-full">
                          <p><strong>Характер:</strong> {activeChar.personality}</p>
                          <p><strong>Манера речи:</strong> {activeChar.speechStyle}</p>
                          <p><strong>Отношение к вам:</strong> {activeChar.attitude}</p>
                        </div>

                        <button
                          type="button"
                          onClick={() => setShowCharInfoModal(true)}
                          className="mt-3 w-full py-2 bg-indigo-600/10 hover:bg-indigo-600/20 border border-indigo-500/20 hover:border-indigo-500/40 text-indigo-300 font-bold text-xs rounded-xl transition-all cursor-pointer select-none flex items-center justify-center gap-1.5"
                        >
                          <User className="w-3.5 h-3.5 text-indigo-400" />
                          <span>📊 Открыть досье и характеристики (21+)</span>
                        </button>

                        {/* 21+ Relationship Scales */}
                        {activeChar.scales && (
                          <div className="mt-4 pt-3.5 border-t border-neutral-800 w-full text-left">
                            <span className="text-[9px] font-bold text-neutral-500 uppercase tracking-wider block mb-2 select-none">
                              📊 Показатели отношений (21+):
                            </span>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                              {/* Trust */}
                              <div className="space-y-1">
                                <div className="flex justify-between text-[10px] font-semibold text-neutral-300">
                                  <span>🤝 Доверие</span>
                                  <span className="text-emerald-400">{(activeChar.scales.trust !== undefined && !isNaN(activeChar.scales.trust)) ? activeChar.scales.trust : 50}%</span>
                                </div>
                                <div className="w-full bg-neutral-950 h-2 rounded-full overflow-hidden border border-neutral-850">
                                  <div 
                                    className="h-full bg-gradient-to-r from-teal-500 to-emerald-400 transition-all duration-500" 
                                    style={{ width: `${(activeChar.scales.trust !== undefined && !isNaN(activeChar.scales.trust)) ? activeChar.scales.trust : 50}%` }}
                                  />
                                </div>
                              </div>
                              {/* Love */}
                              <div className="space-y-1">
                                <div className="flex justify-between text-[10px] font-semibold text-neutral-300">
                                  <span>❤️ Любовь</span>
                                  <span className="text-rose-400">{(activeChar.scales.love !== undefined && !isNaN(activeChar.scales.love)) ? activeChar.scales.love : 0}%</span>
                                </div>
                                <div className="w-full bg-neutral-950 h-2 rounded-full overflow-hidden border border-neutral-850">
                                  <div 
                                    className="h-full bg-gradient-to-r from-pink-500 to-rose-400 transition-all duration-500" 
                                    style={{ width: `${(activeChar.scales.love !== undefined && !isNaN(activeChar.scales.love)) ? activeChar.scales.love : 0}%` }}
                                  />
                                </div>
                              </div>
                              {/* Lust */}
                              <div className="space-y-1">
                                <div className="flex justify-between text-[10px] font-semibold text-neutral-300">
                                  <span>🔥 Вожделение</span>
                                  <span className="text-purple-400">{(activeChar.scales.lust !== undefined && !isNaN(activeChar.scales.lust)) ? activeChar.scales.lust : 0}%</span>
                                </div>
                                <div className="w-full bg-neutral-950 h-2 rounded-full overflow-hidden border border-neutral-850">
                                  <div 
                                    className="h-full bg-gradient-to-r from-fuchsia-500 to-purple-400 transition-all duration-500" 
                                    style={{ width: `${(activeChar.scales.lust !== undefined && !isNaN(activeChar.scales.lust)) ? activeChar.scales.lust : 0}%` }}
                                  />
                                </div>
                              </div>
                              {/* Anger */}
                              <div className="space-y-1">
                                <div className="flex justify-between text-[10px] font-semibold text-neutral-300">
                                  <span>⚡ Гнев</span>
                                  <span className="text-red-400">{(activeChar.scales.anger !== undefined && !isNaN(activeChar.scales.anger)) ? activeChar.scales.anger : 0}%</span>
                                </div>
                                <div className="w-full bg-neutral-950 h-2 rounded-full overflow-hidden border border-neutral-850">
                                  <div 
                                    className="h-full bg-gradient-to-r from-orange-500 to-red-500 transition-all duration-500" 
                                    style={{ width: `${(activeChar.scales.anger !== undefined && !isNaN(activeChar.scales.anger)) ? activeChar.scales.anger : 0}%` }}
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Fetishes and inclinations traits */}
                        {((activeChar.fetishes && activeChar.fetishes.length > 0) || (activeChar.inclinations && activeChar.inclinations.length > 0)) && (
                          <div className="mt-4 pt-3.5 border-t border-neutral-800 w-full text-left space-y-2.5">
                            {activeChar.fetishes && activeChar.fetishes.length > 0 && (
                              <div>
                                <span className="text-[9px] font-bold text-rose-400 uppercase tracking-wider block mb-1 select-none">
                                  🍓 Фетиши и девиации:
                                </span>
                                <div className="flex flex-wrap gap-1">
                                  {activeChar.fetishes.map((f, i) => (
                                    <span key={i} className="text-[9px] bg-rose-500/10 text-rose-300 px-2 py-0.5 rounded-lg border border-rose-500/25 font-semibold transition-all">
                                      💋 {f}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                            {activeChar.inclinations && activeChar.inclinations.length > 0 && (
                              <div>
                                <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-wider block mb-1 select-none">
                                  🧠 Склонности и наклонности:
                                </span>
                                <div className="flex flex-wrap gap-1">
                                  {activeChar.inclinations.map((inc, i) => (
                                    <span key={i} className="text-[9px] bg-indigo-500/10 text-indigo-300 px-2 py-0.5 rounded-lg border border-indigo-500/25 font-semibold transition-all">
                                      ✨ {inc}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )
                  )}

                  {visibleFacts.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-neutral-850 w-full">
                      <div className="text-[10px] text-amber-400 font-bold uppercase tracking-wider flex items-center justify-center gap-1 select-none">
                        <Radio className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                        <span>Известные слухи ({visibleFacts.length})</span>
                      </div>
                      <div className="flex flex-wrap justify-center gap-1 mt-1.5">
                        {visibleFacts.map(fact => (
                          <span key={fact.id} className="text-[9px] bg-neutral-950 text-neutral-300 px-2 py-0.5 rounded border border-neutral-800">
                            📢 {fact.text}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Empty State Screen when no messages exist */}
                {currentChatMessages.length === 0 && (
                  <div className="py-12 max-w-sm mx-auto text-center space-y-4">
                    <div className="p-4 bg-neutral-900/60 rounded-2xl border border-neutral-800">
                      <MessageSquare className="w-8 h-8 text-indigo-400 mx-auto opacity-50 mb-2" />
                      <h4 className="font-bold text-xs text-neutral-200">Диалог пуст</h4>
                      <p className="text-[11px] text-neutral-400 mt-1">
                        Все переписки начинаете именно вы. Напишите сообщение ниже или воспользуйтесь подсказками, чтобы завязать беседу.
                      </p>
                    </div>

                    {activeChar && activeChar.suggestedGreetings && activeChar.suggestedGreetings.length > 0 && (
                      <div className="space-y-1.5 text-left">
                        <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider block text-center">Начать с готовой фразы:</span>
                        <div className="flex flex-col gap-1.5">
                          {activeChar.suggestedGreetings.map((greet, idx) => (
                            <button
                              key={idx}
                              onClick={() => handleSendSuggestedGreeting(greet)}
                              className="text-left text-xs bg-indigo-600/10 hover:bg-indigo-600/20 border border-indigo-500/20 hover:border-indigo-500/40 text-indigo-300 rounded-xl p-2.5 transition-all font-medium cursor-pointer"
                            >
                              💬 "{greet}"
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Rendering Chat Messages */}
                 {currentChatMessages.map((msg) => {
                  const isUser = msg.role === "user";
                  const isNarrator = msg.role === "narrator";
                  let senderName = userProfile?.name || "Игрок";
                  let senderColor = "from-indigo-400 to-indigo-600";
                  
                  if (!isUser && !isNarrator) {
                    const matched = characters.find(c => c.id === msg.senderId);
                    senderName = matched ? matched.name : (activeChar ? activeChar.name : "Персонаж");
                    senderColor = matched ? matched.avatarColor : (activeChar ? activeChar.avatarColor : "from-neutral-400 to-neutral-700");
                  }

                  if (isNarrator) {
                    return (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        key={msg.id}
                        className="flex justify-center my-3 w-full"
                      >
                        <div className="max-w-[90%] sm:max-w-[80%] bg-amber-500/10 border border-amber-500/20 rounded-2xl px-4 py-3 shadow-lg text-center backdrop-blur-sm relative">
                          <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-neutral-950 px-3 text-[9px] font-bold text-amber-400 border border-amber-500/20 rounded-full tracking-widest uppercase flex items-center gap-1 select-none">
                            <span className="animate-pulse">🎭</span> СЛУЧИЛОСЬ СОБЫТИЕ (РАССКАЗЧИК)
                          </div>
                          <p className="text-xs sm:text-sm text-amber-200/90 leading-relaxed font-serif italic whitespace-pre-wrap">
                            {msg.content}
                          </p>
                          <div className="text-[8px] text-neutral-500 mt-1 select-none">
                            {msg.timestamp} • Направление задано Рассказчиком
                          </div>
                        </div>
                      </motion.div>
                    );
                  }

                  return (
                    <motion.div
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      key={msg.id}
                      className={`flex ${isUser ? "justify-end" : "justify-start"} items-end gap-2`}
                    >
                      {/* Avatar for characters */}
                      {!isUser && (
                        <div className={`w-8 h-8 rounded-lg bg-gradient-to-tr ${senderColor} flex items-center justify-center text-white font-bold text-sm shadow-md shrink-0 hidden sm:flex`}>
                          {senderName[0]}
                        </div>
                      )}

                      {/* Bubble frame */}
                      <div className={`max-w-[85%] sm:max-w-[70%] rounded-2xl px-3.5 py-2.5 shadow-md relative group ${
                        isUser
                          ? "bg-indigo-600 text-white rounded-br-none"
                          : "bg-neutral-900 text-neutral-100 rounded-bl-none border border-neutral-800/80"
                      }`}>
                        
                        {/* Group Chat sender indicator */}
                        {activeGroup && !isUser && (
                          <div className="text-[10px] text-indigo-400 font-bold mb-1">
                            {senderName}
                          </div>
                        )}

                        {/* Attached Image or Video inside Bubble */}
                        {msg.image && typeof msg.image === "string" && (
                          <div className="mb-2 rounded-xl overflow-hidden border border-neutral-800 bg-neutral-950/90 shadow-md max-w-sm">
                            {msg.image.startsWith("data:video/") ? (
                              <video
                                src={msg.image}
                                controls
                                className="w-full max-h-64 object-cover"
                              />
                            ) : msg.image.startsWith("data:image/") ? (
                              <div className="cursor-zoom-in">
                                <img
                                  src={msg.image}
                                  alt="Attached"
                                  onClick={() => setZoomImageUrl(msg.image || null)}
                                  className="w-full object-cover hover:scale-105 transition-all"
                                />
                              </div>
                            ) : (
                              /* This is our beautifully styled SIMULATED PHOTO box! */
                              <div className="p-3.5 border-l-4 border-indigo-500 bg-gradient-to-r from-neutral-900 to-neutral-950">
                                <div className="flex items-center space-x-2 text-indigo-400 font-bold text-[10px] uppercase tracking-wider mb-1.5 select-none">
                                  <svg className="w-3.5 h-3.5 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                  </svg>
                                  <span>[Вам прислали фото]</span>
                                </div>
                                <p className="text-xs sm:text-sm text-neutral-200 italic leading-relaxed whitespace-pre-wrap select-text">
                                  {msg.image}
                                </p>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Simulated Voice Message or Call Indicator */}
                        {msg.isVoice ? (
                          <div className="flex items-center gap-2 text-[10px] font-semibold text-neutral-400 mb-1 leading-none select-none">
                            <Mic className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                            <span>🎙️ [Имитация аудио] {msg.isCall ? "Разговор" : "Голосовая заметка"}</span>
                          </div>
                        ) : null}

                        {msg.isCall && !msg.isVoice && (
                          <div className="flex items-center gap-2 text-[10px] font-semibold text-indigo-400 mb-1 leading-none select-none">
                            <Phone className="w-3.5 h-3.5" />
                            <span>📞 Звонок в чате</span>
                          </div>
                        )}

                        {/* Text Content */}
                        <p className="text-xs sm:text-sm leading-relaxed break-words whitespace-pre-wrap">
                          {msg.content}
                        </p>

                        {/* Message Footer: Timestamp */}
                        <div className="flex items-center justify-between mt-1 pt-1 border-t border-neutral-800/5 text-[9px] opacity-65">
                          <span>{msg.timestamp}</span>
                          {msg.isVoice && (
                            <span className="text-[8px] bg-neutral-950/40 text-neutral-400 px-1 rounded">Символы окружения</span>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}

                {/* Bot Typing Simulator & Detailed System Loading Feedback */}
                {isLoading && (
                  <div className="flex justify-start items-center gap-2.5">
                    <div className="bg-neutral-900/90 border border-neutral-800/80 rounded-2xl rounded-bl-none px-4 py-3 shadow-md space-y-2 max-w-sm animate-pulse">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                          <span className="w-2 h-2 rounded-full bg-indigo-400 animate-ping"></span>
                        </div>
                        <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider">ИИ-Собеседник генерирует ответ...</span>
                      </div>
                      
                      <p className="text-[11px] text-neutral-300 font-medium">
                        {systemStatusMessage || "Анализ контекста и генерация реплики..."}
                      </p>

                      <div className="flex items-center gap-1.5 pt-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "0ms" }}></span>
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "150ms" }}></span>
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "300ms" }}></span>
                      </div>
                    </div>
                  </div>
                )}

                <div ref={chatEndRef} />
              </div>

              {/* Attached Image or Video Preview bar */}
              {attachedImage && (
                <div className="px-4 py-2 bg-neutral-900/90 border-t border-neutral-800 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg overflow-hidden border border-neutral-700">
                      {attachedImage.startsWith("data:video/") ? (
                        <video src={attachedImage} className="w-full h-full object-cover" muted playsInline />
                      ) : (
                        <img src={attachedImage} alt="Preview" className="w-full h-full object-cover" />
                      )}
                    </div>
                    <div className="text-xs">
                      <div className="font-semibold text-neutral-200">
                        {attachedImage.startsWith("data:video/") ? "Видео прикреплено" : "Изображение прикреплено"}
                      </div>
                      <div className="text-[10px] text-neutral-400">
                        {attachedImage.startsWith("data:video/") ? "Персонаж проанализирует это видео в ответе" : "Персонаж проанализирует это фото в ответе"}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setAttachedImage(null)}
                    className="p-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white rounded-lg transition-all"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Chat Input & Controller Bar */}
              <div className="border-t border-neutral-850 bg-neutral-900/30 shrink-0 flex flex-col gap-1">
                
                {/* Narrator/Hero Writer Mode Toggle */}
                <div className="px-4 py-1.5 bg-neutral-950/40 border-b border-neutral-850 flex items-center justify-between text-[10px] flex-wrap gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-neutral-500 font-bold uppercase select-none">Вы пишете как:</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setSendAsNarrator(false)}
                        className={`px-2.5 py-1 rounded-md text-[10px] font-bold cursor-pointer transition-all flex items-center gap-1 border ${
                          !sendAsNarrator
                            ? "bg-indigo-600/15 text-indigo-400 border-indigo-500/30 font-extrabold"
                            : "bg-transparent text-neutral-500 border-transparent hover:text-neutral-300"
                        }`}
                      >
                        <User className="w-3 h-3" />
                        <span>Герой ({userProfile?.name})</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setSendAsNarrator(true)}
                        className={`px-2.5 py-1 rounded-md text-[10px] font-bold cursor-pointer transition-all flex items-center gap-1 border ${
                          sendAsNarrator
                            ? "bg-amber-500/15 text-amber-400 border-amber-500/30 font-extrabold"
                            : "bg-transparent text-neutral-500 border-transparent hover:text-neutral-300"
                        }`}
                      >
                        <span>🎭</span>
                        <span>Рассказчик (Корректировка сцены)</span>
                      </button>
                    </div>
                  </div>
                  {sendAsNarrator && (
                    <span className="text-[9px] text-amber-500 animate-pulse font-semibold">
                      ✨ Свободная корректировка сцены и поведения персонажей!
                    </span>
                  )}
                </div>

                {/* Group Chat responder control row */}
                {activeGroup && (
                  <div className="px-4 py-2 bg-neutral-950/80 border-b border-neutral-850 flex flex-wrap items-center gap-2 text-[10px]">
                    <span className="text-neutral-400 font-bold uppercase shrink-0">Кто ответит?</span>
                    <button
                      onClick={() => {
                        setGroupResponders({ ...groupResponders, [activeGroup.id]: "auto" });
                      }}
                      className={`px-2.5 py-1 rounded-full border text-[10px] font-semibold cursor-pointer transition-all ${
                        (groupResponders[activeGroup.id] || "auto") === "auto"
                          ? "bg-indigo-600 text-white border-indigo-500"
                          : "bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-neutral-200"
                      }`}
                    >
                      🤖 Авто-выбор ИИ
                    </button>

                    {activeGroupParticipants.map(participant => (
                      <button
                        key={participant.id}
                        onClick={() => {
                          setGroupResponders({ ...groupResponders, [activeGroup.id]: participant.id });
                        }}
                        className={`px-2.5 py-1 rounded-full border text-[10px] font-semibold cursor-pointer transition-all ${
                          groupResponders[activeGroup.id] === participant.id
                            ? "bg-indigo-600 text-white border-indigo-500"
                            : "bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-neutral-200"
                        }`}
                      >
                        🗣️ {participant.name}
                      </button>
                    ))}
                  </div>
                )}

                {/* Input Bar Form */}
                <form onSubmit={(e) => handleSendMessage(e)} className="p-3 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    
                    {/* Photo & Video Attachment Button */}
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleImageFile}
                      accept="image/*,video/*"
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={triggerImageUpload}
                      title="Прикрепить изображение или видео"
                      className="p-3 bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-indigo-400 rounded-xl border border-neutral-800 transition-all cursor-pointer shrink-0"
                    >
                      <ImageIcon className="w-5 h-5" />
                    </button>

                    {/* Text Input Container with Dynamic Label */}
                    <div className="flex-1 relative">
                      <input
                        type="text"
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        placeholder={
                          sendAsNarrator
                            ? "Опишите событие/действие от лица Рассказчика... (например: 'Внезапно гаснет свет...')"
                            : isVoiceMode
                              ? "Запись голосового (введите текст, который вы скажете)..."
                              : activeGroup 
                                ? `Написать в группу "${activeGroup.name}"...`
                                : `Написать сообщение для ${activeChar?.name}...`
                        }
                        className={`w-full bg-neutral-900 border ${
                          sendAsNarrator
                            ? "border-amber-500/60 focus:border-amber-500 focus:ring-amber-500/20"
                            : isVoiceMode 
                              ? "border-amber-500/50 focus:border-amber-500 focus:ring-amber-500/20" 
                              : "border-neutral-800 focus:border-indigo-500 focus:ring-indigo-500/20"
                        } rounded-xl px-4 py-3 text-xs sm:text-sm focus:outline-none focus:ring-2 placeholder-neutral-500 text-neutral-100 font-serif italic`}
                      />
                      
                      {/* Voice or Narrator mode visual icon indicator inside input */}
                      {isVoiceMode && !sendAsNarrator && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 flex h-2.5 w-2.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
                        </span>
                      )}
                      {sendAsNarrator && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 flex h-2.5 w-2.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
                        </span>
                      )}
                    </div>

                    {/* Toggle Voice Simulation Button */}
                    <button
                      type="button"
                      onClick={() => {
                        setSendAsNarrator(false);
                        setIsVoiceMode(!isVoiceMode);
                      }}
                      title={isVoiceMode ? "Переключить на текстовое" : "Переключить на голосовое"}
                      className={`p-3 rounded-xl border transition-all cursor-pointer shrink-0 ${
                        isVoiceMode && !sendAsNarrator
                          ? "bg-amber-500/10 border-amber-500 text-amber-400 hover:bg-amber-500/20"
                          : "bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-amber-500 hover:bg-neutral-800"
                      }`}
                    >
                      <Mic className="w-5 h-5" />
                    </button>

                    {/* Send Button */}
                    <button
                      type="submit"
                      disabled={(!inputText.trim() && !attachedImage) || isLoading}
                      className={`p-3 text-white rounded-xl shadow-lg transition-all cursor-pointer shrink-0 ${
                        sendAsNarrator
                          ? "bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400"
                          : "bg-indigo-600 hover:bg-indigo-500"
                      } disabled:bg-neutral-800 disabled:text-neutral-600`}
                    >
                      {sendAsNarrator ? <span>🎭</span> : <Send className="w-5 h-5" />}
                    </button>

                  </div>

                  {/* Input helper line */}
                  <div className="flex items-center justify-between px-1 text-[9px] text-neutral-500 select-none">
                    <span>
                      {sendAsNarrator
                        ? "🎭 Вмешательство рассказчика: ИИ сразу отреагирует на описанное вами событие!"
                        : isVoiceMode 
                          ? "🎙️ Голосовой режим: Описание окружения и шумов в ответе будет расширенным!" 
                          : "💬 Обычный чат"}
                    </span>
                    <span>Enter для отправки</span>
                  </div>
                </form>

              </div>

            </div>
          ) : activeTab === "story" ? (
            /* --- ACTIVE VIEW: DYNAMIC STORYTELLER LOGS --- */
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="max-w-2xl mx-auto space-y-3">
                <div className="flex items-center gap-2 text-indigo-400">
                  <BookOpen className="w-5 h-5" />
                  <span className="font-bold uppercase tracking-wider text-xs">Личный Хронометр Судьбы</span>
                </div>
                <h2 className="text-xl sm:text-2xl font-extrabold text-white">Формирующийся Сюжет (Рассказчик)</h2>
                <p className="text-xs sm:text-sm text-neutral-400 leading-relaxed">
                  Куратор ИИ анализирует все ваши диалоги, тайны и раскрытые слухи, сплетая их в полноценное интерактивное произведение. Нажмите кнопку обновления, чтобы Рассказчик обновил сводку и зафиксировал новые вехи!
                </p>

                <div className="pt-2 flex items-center justify-center">
                  <button
                    onClick={() => refreshStoryteller()}
                    disabled={isStoryLoading}
                    className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-2xl shadow-lg shadow-indigo-950 font-bold text-xs sm:text-sm transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                  >
                    <Sparkles className={`w-4 h-4 ${isStoryLoading ? "animate-spin" : ""}`} />
                    <span>{isStoryLoading ? "Рассказчик обдумывает сюжет..." : "🎭 Обновить сюжет на базе диалогов"}</span>
                  </button>
                </div>
              </div>

              {/* Storyteller Direct Intervention Interface */}
              <div className="max-w-2xl mx-auto bg-neutral-900/40 border border-neutral-800 p-5 rounded-2xl space-y-4 shadow-lg backdrop-blur-md relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl"></div>
                <div className="flex items-center gap-2 text-amber-400">
                  <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
                  <h3 className="font-bold text-xs uppercase tracking-wider">Корректировка линии судьбы (Воля Рассказчика)</h3>
                </div>
                <p className="text-xs text-neutral-400 leading-relaxed">
                  Опишите любое внезапное событие, сюжетный поворот, звонок или действие третьих лиц. Рассказчик перестроит сводку событий и сгенерирует новые слухи, которые персонажи сразу начнут обсуждать в чатах.
                </p>
                <div className="space-y-3">
                  <textarea
                    value={customDirectiveText}
                    onChange={(e) => setCustomDirectiveText(e.target.value)}
                    placeholder="Пример: 'Внезапно мама находит в моей комнате пачку сигарет и устраивает скандал' или 'Артем попадает в аварию во время гонки и просит меня о помощи'..."
                    rows={3}
                    className="w-full bg-neutral-950 border border-neutral-850 rounded-xl p-3 text-xs text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-amber-500 transition-all resize-none"
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      disabled={isStoryLoading || !customDirectiveText.trim()}
                      onClick={async () => {
                        const directive = customDirectiveText.trim();
                        if (!directive) return;
                        setCustomDirectiveText("");
                        await refreshStoryteller(directive);
                      }}
                      className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 disabled:from-neutral-800 disabled:to-neutral-800 text-neutral-950 disabled:text-neutral-500 font-bold text-xs rounded-xl shadow-md transition-all active:scale-[0.98] cursor-pointer flex items-center gap-1.5"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>{isStoryLoading ? "Материализация событий..." : "Внедрить волю Рассказчика"}</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="max-w-2xl mx-auto mt-6 space-y-6">
                
                {isStoryLoading ? (
                  <div className="bg-neutral-900 border border-neutral-800 p-8 rounded-2xl text-center space-y-3 animate-pulse">
                    <div className="h-4 bg-neutral-800 rounded w-2/3 mx-auto"></div>
                    <div className="h-3 bg-neutral-800 rounded w-5/6 mx-auto"></div>
                    <div className="h-3 bg-neutral-800 rounded w-4/5 mx-auto"></div>
                    <div className="h-3 bg-neutral-800 rounded w-1/2 mx-auto"></div>
                  </div>
                ) : storyLog ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="space-y-6"
                  >
                    {/* Story Summary text */}
                    <div className="bg-neutral-900/60 border border-neutral-800 p-5 rounded-2xl backdrop-blur-md space-y-3 relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl"></div>
                      <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
                        <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Текущая ситуация</span>
                        <span className="text-[10px] text-neutral-500">Обновлено: {storyLog.lastUpdated}</span>
                      </div>
                      <p className="text-xs sm:text-sm text-neutral-200 leading-relaxed whitespace-pre-wrap font-serif tracking-wide">
                        {storyLog.storySummary}
                      </p>
                    </div>

                    {/* Timeline key chapters */}
                    {storyLog.keyChapters && storyLog.keyChapters.length > 0 && (
                      <div className="space-y-3">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400">Разблокированные Сюжетные Вехи</h3>
                        <div className="space-y-2 relative pl-4 border-l border-indigo-500/20">
                          {storyLog.keyChapters.map((chapter, idx) => (
                            <div key={idx} className="relative py-1">
                              <span className="absolute -left-[21px] top-2 w-2.5 h-2.5 rounded-full bg-indigo-500 border-2 border-neutral-950 shadow"></span>
                              <div className="bg-neutral-900/40 border border-neutral-850 p-3 rounded-xl">
                                <h4 className="font-bold text-xs text-neutral-200">Веха {idx + 1}: {chapter}</h4>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </motion.div>
                ) : (
                  <div className="bg-neutral-900/30 border border-neutral-800/80 p-8 rounded-3xl text-center text-neutral-500 text-sm leading-relaxed max-w-xl mx-auto">
                    <BookOpen className="w-10 h-10 text-neutral-700 mx-auto mb-2" />
                    <span>Сюжетный журнал пока пуст. Пообщайтесь с персонажами в чатах, а затем обновите сюжет сверху, чтобы запустить формирование общей повести!</span>
                  </div>
                )}

              </div>
            </div>
          ) : activeTab === "lore" ? (
            /* --- ACTIVE VIEW: GOSSIP AND FACT RADAR --- */
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="max-w-2xl mx-auto space-y-3">
                <div className="flex items-center gap-2 text-amber-400">
                  <Radio className="w-5 h-5 animate-pulse" />
                  <span className="font-bold uppercase tracking-wider text-xs">Панель сюжетных слухов</span>
                </div>
                <h2 className="text-xl sm:text-2xl font-extrabold text-neutral-50">Память Сюжета (Gossip Radar)</h2>
                <p className="text-xs sm:text-sm text-neutral-400 leading-relaxed">
                  Сплетни автоматически вычленяются ИИ из диалогов! Они могут распространяться в социальных кругах (Друзья, Семья, Работа, Соседи) или быть известны абсолютно всем. Ниже вы можете искусственно запустить любой факт.
                </p>
              </div>

              {/* Add Custom Fact form */}
              <div className="max-w-2xl mx-auto bg-neutral-900 border border-neutral-800 p-5 rounded-2xl space-y-4 shadow-lg">
                <h3 className="font-bold text-xs text-neutral-200 uppercase tracking-wider">Запустить новую сплетню</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="sm:col-span-2">
                    <input
                      type="text"
                      id="manual-fact-input"
                      placeholder="Например: 'У главного героя серьезные проблемы с финансами'..."
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-neutral-100 placeholder-neutral-700 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <select
                      id="manual-fact-group"
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-neutral-100 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="Все">📢 Для всех (Все)</option>
                      <option value="Друзья">👥 Только Друзья</option>
                      <option value="Семья">🏡 Только Семья</option>
                      <option value="Работа">💼 Только Работа</option>
                      <option value="Соседи">🧱 Только Соседи</option>
                    </select>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const txt = (document.getElementById("manual-fact-input") as HTMLInputElement)?.value;
                    const grp = (document.getElementById("manual-fact-group") as HTMLSelectElement)?.value as any;
                    if (!txt || !txt.trim()) return;

                    const fact: SharedFact = {
                      id: `manual-${Date.now()}`,
                      text: txt.trim(),
                      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                      sourceCharacterId: "user",
                      group: grp
                    };

                    setSharedFacts(prev => [fact, ...prev]);
                    (document.getElementById("manual-fact-input") as HTMLInputElement).value = "";
                    setGossipNotification(`Добавлен слух: "${txt}"`);
                    setTimeout(() => setGossipNotification(null), 3500);
                  }}
                  className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-neutral-950 rounded-xl font-bold text-xs transition-all cursor-pointer shadow-md flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>Вбросить в память мира</span>
                </button>
              </div>

              {/* Facts List */}
              <div className="max-w-2xl mx-auto space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-xs uppercase tracking-wider text-neutral-400">Активные слухи в игре ({sharedFacts.length})</h3>
                  {sharedFacts.length > 0 && (
                    <button
                      onClick={() => setSharedFacts([])}
                      className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Стереть память
                    </button>
                  )}
                </div>

                {sharedFacts.length === 0 ? (
                  <div className="bg-neutral-900/30 border border-neutral-800/60 p-8 rounded-2xl text-center text-neutral-500 text-sm leading-relaxed">
                    Память пока пуста. <br /> Расскажите секреты персонажам в переписках, чтобы запустить их циркуляцию!
                  </div>
                ) : (
                  <div className="space-y-2">
                    {sharedFacts.map((fact) => {
                      const sourceChar = characters.find(c => c.id === fact.sourceCharacterId);
                      return (
                        <div
                          key={fact.id}
                          className="bg-neutral-900 border border-neutral-800/80 p-3 rounded-xl flex items-center justify-between gap-4 hover:border-neutral-750 transition-all text-xs"
                        >
                          <div className="space-y-1 flex-1 min-w-0">
                            <p className="text-xs font-semibold text-neutral-100 break-words">{fact.text}</p>
                            <div className="flex items-center gap-2 text-[9px] text-neutral-400">
                              <span>Круг: {fact.group === "Все" ? "Глобальный" : fact.group}</span>
                              <span>•</span>
                              <span>Источник: {sourceChar ? sourceChar.name : "Главный Герой"}</span>
                            </div>
                          </div>

                          <button
                            onClick={() => setSharedFacts(prev => prev.filter(f => f.id !== fact.id))}
                            className="p-1.5 hover:bg-neutral-850 text-neutral-500 hover:text-red-400 rounded-lg transition-all"
                            title="Удалить воспоминание"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* --- ACTIVE VIEW: USER PROFILE & SETTINGS (MOBILE) --- */
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 bg-neutral-950">
              <div className="max-w-xl mx-auto space-y-5">
                
                {/* Title */}
                <div className="space-y-1.5 text-left">
                  <div className="flex items-center gap-2 text-indigo-400">
                    <User className="w-5 h-5 text-indigo-400" />
                    <span className="font-bold uppercase tracking-wider text-xs">Личный кабинет Героя</span>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-extrabold text-white">Профиль и Настройки</h2>
                  <p className="text-xs text-neutral-400 leading-relaxed">
                    Здесь вы можете просмотреть свои параметры, изменить внешность главного героя или полностью перезапустить симуляцию.
                  </p>
                </div>

                {/* Main Profile Info Card */}
                {userProfile && (
                  <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 space-y-4 shadow-xl relative overflow-hidden">
                    {/* Decorative radial gradient */}
                    <div className="absolute -right-24 -top-24 w-48 h-48 rounded-full bg-indigo-600/10 blur-3xl pointer-events-none"></div>
                    
                    <div className="flex items-start gap-4">
                      {userProfile.photo ? (
                        <img 
                          src={userProfile.photo} 
                          alt={userProfile.name} 
                          referrerPolicy="no-referrer"
                          className="w-14 h-14 rounded-xl object-cover border border-neutral-700/60 shadow-inner"
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center font-black text-lg text-white shadow-md shadow-indigo-950/30">
                          {userProfile.name ? userProfile.name.charAt(0).toUpperCase() : "Г"}
                        </div>
                      )}
                      
                      <div className="space-y-1 text-left min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-base text-neutral-100 truncate">{userProfile.name}</h3>
                          <span className="bg-indigo-500/10 text-indigo-400 text-[10px] px-2 py-0.5 rounded-full font-bold border border-indigo-500/10">{userProfile.age} лет</span>
                        </div>
                        <p className="text-xs text-neutral-400 font-semibold">{userProfile.gender}</p>
                      </div>
                    </div>

                    <div className="border-t border-neutral-800/80 pt-4 space-y-3.5 text-left text-xs">
                      <div>
                        <span className="font-bold text-[9px] text-neutral-500 uppercase tracking-wider block mb-1">🎭 Черты характера:</span>
                        <div className="flex flex-wrap gap-1">
                          {(userProfile.traits || "").split(",").filter(Boolean).map((trait, idx) => (
                            <span key={idx} className="bg-neutral-950 border border-neutral-800 text-neutral-300 px-2.5 py-1 rounded-lg text-[10px] font-medium">
                              ✨ {trait.trim()}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div>
                        <span className="font-bold text-[9px] text-neutral-500 uppercase tracking-wider block mb-1">📖 Короткая Биография:</span>
                        <p className="text-neutral-300 leading-relaxed bg-neutral-950/50 p-2.5 border border-neutral-800/30 rounded-xl">
                          {userProfile.bio}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Physical traits and appearance */}
                {userProfile && (
                  <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 space-y-4 shadow-xl text-left">
                    <h3 className="font-bold text-xs text-neutral-200 uppercase tracking-wider flex items-center gap-1.5 border-b border-neutral-800 pb-2">
                      <span>🍓 Параметры Внешности:</span>
                    </h3>

                    {/* Привлекательность ГГ */}
                    <div className="bg-gradient-to-r from-rose-950/20 to-indigo-950/20 border border-rose-500/10 p-4 rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                          <span>🔥</span> Уровень Привлекательности ГГ
                        </span>
                        <span className="text-sm font-extrabold text-rose-400">{userProfile.attractiveness ?? 80}%</span>
                      </div>
                      <div className="w-full bg-neutral-950 h-2 rounded-full overflow-hidden border border-neutral-800">
                        <div 
                          className="bg-gradient-to-r from-rose-500 to-indigo-500 h-full transition-all duration-300" 
                          style={{ width: `${userProfile.attractiveness ?? 80}%` }}
                        ></div>
                      </div>
                      <p className="text-[10px] text-neutral-400 leading-normal">
                        Барометр красоты вашей героини. Высокий балл (75-100%) вызывает у мужских персонажей непреодолимое вожделение и откровенный, нефильтрованный флирт, а муж Макс начинает безумно ревновать. Вы можете настроить этот балл при редактировании анкеты.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 xs:grid-cols-3 gap-2.5 text-center">
                      <div className="bg-neutral-950 border border-neutral-800/60 p-2.5 rounded-xl">
                        <span className="text-[9px] text-neutral-500 uppercase font-semibold block">Лицо</span>
                        <span className="text-xs font-bold text-neutral-200">{userProfile.face}</span>
                      </div>
                      <div className="bg-neutral-950 border border-neutral-800/60 p-2.5 rounded-xl">
                        <span className="text-[9px] text-neutral-500 uppercase font-semibold block">Грудь</span>
                        <span className="text-xs font-bold text-neutral-200">{userProfile.chest}</span>
                      </div>
                      <div className="bg-neutral-950 border border-neutral-800/60 p-2.5 rounded-xl">
                        <span className="text-[9px] text-neutral-500 uppercase font-semibold block">Талия</span>
                        <span className="text-xs font-bold text-neutral-200">{userProfile.waist}</span>
                      </div>
                      <div className="bg-neutral-950 border border-neutral-800/60 p-2.5 rounded-xl">
                        <span className="text-[9px] text-neutral-500 uppercase font-semibold block">Бёдра</span>
                        <span className="text-xs font-bold text-neutral-200">{userProfile.hips}</span>
                      </div>
                      <div className="bg-neutral-950 border border-neutral-800/60 p-2.5 rounded-xl">
                        <span className="text-[9px] text-neutral-500 uppercase font-semibold block">Интим. зоны</span>
                        <span className="text-xs font-bold text-neutral-200">{userProfile.intimate}</span>
                      </div>
                      <div className="bg-neutral-950 border border-neutral-800/60 p-2.5 rounded-xl">
                        <span className="text-[9px] text-neutral-500 uppercase font-semibold block">Ноги</span>
                        <span className="text-xs font-bold text-neutral-200">{userProfile.legs}</span>
                      </div>
                    </div>

                    <div className="bg-neutral-950 border border-neutral-800/60 p-3 rounded-xl space-y-1">
                      <span className="text-[9px] text-neutral-500 uppercase font-semibold block">Общее состояние:</span>
                      <p className="text-xs text-neutral-300 leading-relaxed">{userProfile.overall}</p>
                    </div>

                    {/* Button to open edit modal */}
                    <button
                      onClick={openEditProfile}
                      className="w-full mt-2 py-3 bg-neutral-950 hover:bg-neutral-850 border border-neutral-800 rounded-xl text-indigo-400 font-bold text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-[0.98]"
                    >
                      <span>📝 Редактировать анкету и фото</span>
                    </button>
                  </div>
                )}

                {/* AI Detailed Analysis section on mobile profile */}
                {(profileDetailedAnalysis || profileImageSceneDescription || profilePlotContext) && (
                  <div className="bg-neutral-900 border border-neutral-800 p-5 rounded-2xl space-y-4 text-left">
                    <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5 border-b border-neutral-800 pb-2">
                      <span>🔮 Углубленный ИИ-Анализ Внешности:</span>
                    </span>
                    
                    <div className="space-y-3">
                      {profileDetailedAnalysis && (
                        <div className="bg-indigo-950/20 border border-indigo-900/30 p-3.5 rounded-xl space-y-1">
                          <span className="font-bold text-[9px] text-indigo-300 uppercase tracking-wider block">🎨 Психофизический Анализ & Харизма:</span>
                          <p className="text-neutral-300 text-[11px] leading-relaxed whitespace-pre-wrap">{profileDetailedAnalysis}</p>
                        </div>
                      )}

                      {profileImageSceneDescription && (
                        <div className="bg-purple-950/20 border border-purple-900/30 p-3.5 rounded-xl space-y-1">
                          <span className="font-bold text-[9px] text-purple-300 uppercase tracking-wider block">📸 Описание сцены & одежды на фото:</span>
                          <p className="text-neutral-300 text-[11px] leading-relaxed whitespace-pre-wrap">{profileImageSceneDescription}</p>
                        </div>
                      )}

                      {profilePlotContext && (
                        <div className="bg-rose-950/20 border border-rose-900/30 p-3.5 rounded-xl space-y-1">
                          <span className="font-bold text-[9px] text-rose-300 uppercase tracking-wider block">📖 Влияние на Сюжет & Реакции Окружающих:</span>
                          <p className="text-neutral-300 text-[11px] leading-relaxed whitespace-pre-wrap">{profilePlotContext}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* DANGER ZONE - Game Reset Button with huge safe touch target */}
                <div className="bg-red-950/20 border border-red-900/50 rounded-2xl p-5 space-y-4 text-left shadow-xl shadow-red-950/10">
                  <div className="flex items-center gap-2 text-red-400 border-b border-red-900/30 pb-2">
                    <AlertTriangle className="w-5 h-5 animate-pulse text-red-500" />
                    <span className="font-extrabold uppercase tracking-wider text-xs text-red-400">Опасная зона</span>
                  </div>

                  <p className="text-[11px] text-neutral-300 leading-relaxed">
                    Вы можете полностью стереть текущую игру и начать заново. Это безвозвратно сотрет все ваши переписки, созданных персонажей, шкалы отношений и сюжетные сводки Рассказчика.
                  </p>

                  <button
                    onClick={handleResetData}
                    className="w-full py-4 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold text-xs sm:text-sm tracking-wide transition-all duration-150 cursor-pointer shadow-lg shadow-red-950/35 flex items-center justify-center gap-2.5 active:scale-[0.98] min-h-[50px]"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>НАЧАТЬ ВСЁ СНАЧАЛА</span>
                  </button>
                </div>

              </div>
            </div>
          )}

        </main>

        {/* PANEL 3: Right Column - Gossip radar panel (Desktop only) */}
        <aside className="w-80 border-l border-neutral-800 bg-neutral-900/10 flex flex-col shrink-0 hidden lg:flex overflow-y-auto p-4 space-y-4 custom-scrollbar">
          
          <div className="space-y-1">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5 select-none">
              <Radio className="w-4 h-4 text-amber-500 animate-pulse shrink-0" />
              <span>Мировая Память</span>
            </h3>
            <p className="text-[10px] text-neutral-500 leading-relaxed">
              Факты циркулируют между людьми. Сосед дядя Толя не узнает ваши дела с работы, если только Сергей не расскажет их ему напрямую в общей группе!
            </p>
          </div>

          {/* Quick Info User Profile card inside sidebar */}
          <div className="bg-neutral-900 border border-neutral-800 p-3.5 rounded-xl space-y-2 text-xs">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-1.5 mb-1">
              <span className="font-bold text-neutral-200 flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-indigo-400" />
                Личность Игрока
              </span>
              <button onClick={openEditProfile} className="text-[10px] text-indigo-400 hover:underline">
                Изм.
              </button>
            </div>
            <div className="flex gap-2.5 items-start">
              {userProfile && userProfile.photo && (
                <div className="w-10 h-10 rounded-lg overflow-hidden border border-neutral-800 shrink-0">
                  <img src={userProfile.photo} alt="GG" className="w-full h-full object-cover" />
                </div>
              )}
              {userProfile ? (
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-neutral-300"><strong>Имя:</strong> {userProfile.name} ({userProfile.gender}, {userProfile.age} л.)</p>
                  <p className="text-[11px] text-neutral-400 truncate"><strong>Черты:</strong> {userProfile.traits}</p>
                  <p className="text-[11px] text-rose-400 font-semibold mt-0.5"><strong>Привлекательность:</strong> {userProfile.attractiveness ?? 80}%</p>
                </div>
              ) : (
                <div className="min-w-0 flex-1 text-neutral-500 text-[11px]">Профиль не создан</div>
              )}
            </div>
          </div>

          {/* Active rumor radar inside sidebar */}
          <div className="space-y-2 flex-1 flex flex-col min-h-0">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 select-none">
              Активные факты в мире ({sharedFacts.length})
            </h4>

            {sharedFacts.length === 0 ? (
              <div className="bg-neutral-950/40 border border-neutral-800/40 p-5 rounded-xl text-center text-[10px] text-neutral-500 leading-relaxed flex-1 flex flex-col items-center justify-center">
                <Radio className="w-5 h-5 text-neutral-700 mb-1.5" />
                <span>База воспоминаний пуста. Вбросьте слух во вкладке «Сплетни»!</span>
              </div>
            ) : (
              <div className="space-y-2 overflow-y-auto pr-1 flex-1 custom-scrollbar">
                {sharedFacts.map(fact => {
                  return (
                    <div
                      key={fact.id}
                      className="bg-neutral-900 border border-neutral-800/60 p-2.5 rounded-lg flex flex-col gap-1 relative group text-xs"
                    >
                      <button
                        onClick={() => setSharedFacts(prev => prev.filter(f => f.id !== fact.id))}
                        className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-red-400 p-0.5 rounded transition-all"
                        title="Удалить слух"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>

                      <p className="text-[11px] text-neutral-200 pr-3.5 leading-normal">
                        {fact.text}
                      </p>
                      
                      <div className="flex items-center justify-between text-[8px] text-neutral-500 mt-1">
                        <span className="text-indigo-400">
                          {fact.group === "Все" ? "Глобальный" : `Круг: ${fact.group}`}
                        </span>
                        <span>{fact.timestamp}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </aside>

      </div>

      {/* MODAL 1: Character Add / Edit Form */}
      <AnimatePresence>
        {showCharModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-neutral-900 border border-neutral-800 w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
            >
              {/* Modal Header */}
              <div className="p-4 border-b border-neutral-800 flex items-center justify-between bg-neutral-900/60">
                <div className="flex items-center gap-2 text-indigo-400">
                  <PenSquare className="w-5 h-5" />
                  <h3 className="font-bold text-base text-white">
                    {editingCharId ? `Настройка характера: ${charName}` : "Создать нового персонажа"}
                  </h3>
                </div>
                <button
                  onClick={() => setShowCharModal(false)}
                  className="p-1.5 hover:bg-neutral-800 text-neutral-400 hover:text-white rounded-lg transition-all cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Form content */}
              <form onSubmit={handleSaveCharacter} className="p-5 overflow-y-auto space-y-4 flex-1 custom-scrollbar text-xs sm:text-sm">
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-neutral-400 mb-1 font-bold">Имя персонажа *</label>
                    <input
                      type="text"
                      required
                      value={charName}
                      onChange={(e) => setCharName(e.target.value)}
                      placeholder="Например: Алина"
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-neutral-200 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-400 mb-1 font-bold">Роль / Связь *</label>
                    <input
                      type="text"
                      required
                      value={charRole}
                      onChange={(e) => setCharRole(e.target.value)}
                      placeholder="Например: Тайная воздыхательница"
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-neutral-200 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-neutral-400 mb-1 font-bold">Социальный круг *</label>
                  <select
                    value={charGroup}
                    onChange={(e) => setCharGroup(e.target.value as any)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-neutral-200 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="Друзья">👥 Друзья (Делится сплетнями с Машей и Артёмом)</option>
                    <option value="Семья">🏡 Семья (Родные, родители)</option>
                    <option value="Работа">💼 Работа (Коллеги)</option>
                    <option value="Соседи">🧱 Соседи (Жильцы дома)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-neutral-400 mb-1 font-bold">Подробное описание характера *</label>
                  <textarea
                    required
                    rows={3}
                    value={charPersonality}
                    onChange={(e) => setCharPersonality(e.target.value)}
                    placeholder="Например: Капризная, ревнивая, обожает дорогие клубы. Часто злится по пустякам, но легко прощает."
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-neutral-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-neutral-400 mb-1 font-bold">Отношение к вам</label>
                    <input
                      type="text"
                      value={charAttitude}
                      onChange={(e) => setCharAttitude(e.target.value)}
                      placeholder="Ревнивый флирт"
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-neutral-200 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-400 mb-1 font-bold">Манера общения</label>
                    <input
                      type="text"
                      value={charSpeech}
                      onChange={(e) => setCharSpeech(e.target.value)}
                      placeholder="Шлет капс и кучу сердечек"
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-neutral-200 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-neutral-400 mb-1 font-bold">Первое приветствие (Для подсказок запуска)</label>
                  <input
                    type="text"
                    value={charGreeting}
                    onChange={(e) => setCharGreeting(e.target.value)}
                    placeholder="Привет! Где ты шляешься? Мы же договаривались..."
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-neutral-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Adult 21+ qualities & relationship scales section */}
                <div className="border-t border-neutral-800/80 pt-4 space-y-3.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-rose-400 block select-none">
                    🍓 Ролевые показатели и наклонности (21+)
                  </span>

                  {/* Scales editing */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-neutral-400 mb-1 font-semibold">🤝 Доверие (0-100%)</label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={charTrust}
                        onChange={(e) => setCharTrust(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-1.5 text-neutral-200 focus:outline-none focus:border-indigo-500 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-neutral-400 mb-1 font-semibold">❤️ Любовь (0-100%)</label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={charLove}
                        onChange={(e) => setCharLove(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-1.5 text-neutral-200 focus:outline-none focus:border-indigo-500 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-neutral-400 mb-1 font-semibold">🔥 Вожделение (0-100%)</label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={charLust}
                        onChange={(e) => setCharLust(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-1.5 text-neutral-200 focus:outline-none focus:border-indigo-500 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-neutral-400 mb-1 font-semibold">⚡ Гнев (0-100%)</label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={charAnger}
                        onChange={(e) => setCharAnger(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-1.5 text-neutral-200 focus:outline-none focus:border-indigo-500 text-xs"
                      />
                    </div>
                  </div>

                  {/* Fetishes and inclinations editing */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-neutral-400 mb-1 font-semibold">🍓 Фетиши (через запятую)</label>
                      <input
                        type="text"
                        value={charFetishes}
                        onChange={(e) => setCharFetishes(e.target.value)}
                        placeholder="Доминирование, Чулки, Dirty talk"
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-neutral-200 focus:outline-none focus:border-indigo-500 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-neutral-400 mb-1 font-semibold">🧠 Склонности (через запятую)</label>
                      <input
                        type="text"
                        value={charInclinations}
                        onChange={(e) => setCharInclinations(e.target.value)}
                        placeholder="Ревность, Собственничество"
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-neutral-200 focus:outline-none focus:border-indigo-500 text-xs"
                      />
                    </div>
                  </div>
                </div>

                {/* Footer Buttons */}
                <div className="pt-3 border-t border-neutral-800 flex items-center justify-between shrink-0">
                  {editingCharId ? (
                    <button
                      type="button"
                      onClick={() => handleDeleteCharacter(editingCharId)}
                      className="px-4 py-2 bg-red-600/10 hover:bg-red-600/25 border border-red-500/20 text-red-400 rounded-xl font-bold text-xs cursor-pointer transition-all"
                    >
                      🗑️ Удалить персонажа
                    </button>
                  ) : (
                    <div></div>
                  )}

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowCharModal(false)}
                      className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl font-bold text-xs cursor-pointer"
                    >
                      Отмена
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-xs cursor-pointer shadow-lg"
                    >
                      Сохранить
                    </button>
                  </div>
                </div>

              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 2: Create Group Modal */}
      <AnimatePresence>
        {showGroupModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-neutral-900 border border-neutral-800 w-full max-w-md rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]"
            >
              <div className="p-4 border-b border-neutral-800 flex items-center justify-between bg-neutral-900/60">
                <div className="flex items-center gap-2 text-indigo-400">
                  <Users className="w-5 h-5" />
                  <h3 className="font-bold text-base text-white">Создать групповой чат</h3>
                </div>
                <button
                  onClick={() => setShowGroupModal(false)}
                  className="p-1.5 hover:bg-neutral-800 text-neutral-400 hover:text-white rounded-lg transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreateGroup} className="p-5 space-y-4 overflow-y-auto custom-scrollbar text-xs">
                <div>
                  <label className="block text-xs text-neutral-400 mb-1.5 font-bold">Название группы *</label>
                  <input
                    type="text"
                    required
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder="Например: Семья в сборе, Курилка-Пятница"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2.5 text-neutral-100 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs text-neutral-400 mb-1.5 font-bold">Выберите участников группы *</label>
                  <div className="bg-neutral-950 rounded-xl p-3 border border-neutral-800 space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                    {characters.map(char => {
                      const isChecked = selectedParticipants.includes(char.id);
                      return (
                        <label
                          key={char.id}
                          className="flex items-center gap-3.5 p-1.5 hover:bg-neutral-900 rounded-lg cursor-pointer text-xs"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              if (isChecked) {
                                setSelectedParticipants(prev => prev.filter(id => id !== char.id));
                              } else {
                                setSelectedParticipants(prev => [...prev, char.id]);
                              }
                            }}
                            className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="font-semibold text-neutral-200">{char.name}</span>
                          <span className="text-[10px] text-neutral-500">({char.role})</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-2 border-t border-neutral-800 flex items-center justify-end gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowGroupModal(false)}
                    className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl font-bold text-xs"
                  >
                    Отмена
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-xs shadow-md shadow-indigo-950"
                  >
                    Создать группу
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 3: Photo Zoom View */}
      <AnimatePresence>
        {zoomImageUrl && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/95">
            <button
              onClick={() => setZoomImageUrl(null)}
              className="absolute top-4 right-4 p-2 bg-neutral-800/85 hover:bg-neutral-800 text-neutral-400 hover:text-white rounded-xl backdrop-blur-md cursor-pointer transition-all"
            >
              <X className="w-6 h-6" />
            </button>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="max-w-[90vw] max-h-[90vh] rounded-xl overflow-hidden border border-neutral-800 shadow-2xl"
            >
              <img src={zoomImageUrl} alt="Zoomed" className="object-contain max-h-[90vh]" />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 4: User Profile Editing */}
      <AnimatePresence>
        {showProfileModal && userProfile && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-neutral-900 border border-neutral-800 w-full max-w-3xl rounded-2xl overflow-hidden shadow-2xl flex flex-col text-xs max-h-[90vh]"
            >
              <div className="p-4 border-b border-neutral-800 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2 text-indigo-400">
                  <User className="w-5 h-5 animate-pulse" />
                  <h3 className="font-bold text-sm text-white">Редактирование профиля героя</h3>
                </div>
                <button type="button" onClick={() => setShowProfileModal(false)} className="text-neutral-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveProfile} className="flex-1 flex flex-col overflow-hidden min-h-0">
                <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Левая колонка: Основная информация */}
                    <div className="space-y-4">
                      <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider block border-b border-neutral-800/50 pb-1">📋 Основные данные:</span>
                      <div>
                        <label className="block text-[10px] font-bold text-neutral-400 uppercase mb-1">Имя *</label>
                        <input
                          type="text"
                          required
                          value={profileName}
                          onChange={(e) => setProfileName(e.target.value)}
                          className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-neutral-100"
                        />
                      </div>

                      {/* Фото ГГ (Главного Героя) */}
                      <div>
                        <label className="block text-[10px] font-bold text-neutral-400 uppercase mb-1">
                          Фотография Персонажа (ГГ)
                        </label>
                        <div className="flex items-center gap-4 bg-neutral-950/40 border border-neutral-800/80 p-3 rounded-xl">
                          <div className="w-16 h-16 rounded-xl border border-neutral-800 bg-neutral-950 flex items-center justify-center overflow-hidden shrink-0">
                            {isEvaluatingPhoto ? (
                              <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                            ) : profilePhoto ? (
                              <img src={profilePhoto} alt="GG Preview" className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-neutral-600 text-[10px] text-center px-1">Без фото</span>
                            )}
                          </div>
                          <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                            <input
                              type="file"
                              accept="image/*"
                              disabled={isEvaluatingPhoto}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handlePhotoUploadAndEvaluation(file);
                              }}
                              className="hidden"
                              id="gg-photo-upload"
                            />
                            <label
                              htmlFor="gg-photo-upload"
                              className={`px-3 py-1.5 text-[11px] font-medium rounded-lg text-center transition-all select-none ${
                                isEvaluatingPhoto
                                  ? "bg-neutral-800 text-neutral-500 cursor-not-allowed"
                                  : "bg-neutral-800 hover:bg-neutral-700 text-neutral-200 cursor-pointer"
                              }`}
                            >
                              {isEvaluatingPhoto ? "Анализ фото..." : profilePhoto ? "Изменить фото" : "Загрузить фото"}
                            </label>
                            {profilePhoto && !isEvaluatingPhoto && (
                              <button
                                type="button"
                                onClick={() => {
                                  setProfilePhoto(null);
                                  // Reset parameters
                                  setProfileFace("Привлекательное, чистое лицо");
                                  setProfileChest("Упругая, округлая грудь");
                                  setProfileWaist("Тонкая талия, плоский живот");
                                  setProfileHips("Выразительные, округлые бёдра");
                                  setProfileIntimate("Аккуратные, ухоженные интимные зоны");
                                  setProfileLegs("Стройные, длинные ноги");
                                  setProfileOverall("Здоровое, спортивное и ухоженное тело без уродств");
                                }}
                                className="text-[10px] text-red-400 hover:text-red-300 font-semibold text-left transition-all cursor-pointer self-start"
                              >
                                Удалить фото
                              </button>
                            )}
                          </div>
                        </div>
                        {evaluationError && (
                          <p className="text-[9px] text-amber-400 mt-1">{evaluationError}</p>
                        )}
                        <p className="text-[9px] text-neutral-500 mt-1">
                          Загруженное фото ГГ позволяет остальным персонажам оценивать внешность и формировать влечение!
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-bold text-neutral-400 uppercase mb-1">Возраст *</label>
                          <input
                            type="number"
                            required
                            value={profileAge}
                            onChange={(e) => setProfileAge(parseInt(e.target.value) || 20)}
                            className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-neutral-100"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-neutral-400 uppercase mb-1">Пол *</label>
                          <div className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-neutral-400 text-xs font-semibold select-none flex items-center gap-1.5">
                            <span className="text-rose-500 font-bold">♀</span> Женский (фиксирован)
                          </div>
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label className="block text-[10px] font-bold text-neutral-400 uppercase">Уровень привлекательности главной героини: <span className="text-rose-400 font-extrabold">{profileAttractiveness}%</span></label>
                          <span className="text-[9px] text-rose-300 font-semibold">
                            {profileAttractiveness >= 85 ? "🔥 Сногсшибательная" : profileAttractiveness >= 65 ? "✨ Привлекательная" : profileAttractiveness >= 40 ? "😊 Обычная" : "🥶 Невзрачная"}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2">
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={profileAttractiveness}
                            onChange={(e) => setProfileAttractiveness(parseInt(e.target.value))}
                            className="flex-1 accent-rose-500 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
                          />
                          <span className="text-xs font-black text-rose-400 w-8 text-right">{profileAttractiveness}%</span>
                        </div>
                        <p className="text-[9px] text-neutral-500 mt-0.5 leading-normal">
                          Позволяет динамически корректировать вожделение других персонажей к вам.
                        </p>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-neutral-400 uppercase mb-1">Черты характера *</label>
                        <input
                          type="text"
                          required
                          value={profileTraits}
                          onChange={(e) => setProfileTraits(e.target.value)}
                          className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-neutral-100"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-neutral-400 uppercase mb-1">Короткая Био *</label>
                        <textarea
                          required
                          rows={2.5}
                          value={profileBio}
                          onChange={(e) => setProfileBio(e.target.value)}
                          className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-neutral-100"
                        />
                      </div>
                    </div>

                    {/* Правая колонка: Физические параметры */}
                    <div className="space-y-4">
                      <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider block border-b border-neutral-800/50 pb-1">🍓 Объективная Внешность:</span>
                      
                      <div className="bg-neutral-950/35 border border-neutral-800/50 p-4 rounded-xl space-y-3.5">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[9px] text-neutral-400 mb-1 font-bold uppercase">Лицо *</label>
                            <input
                              type="text"
                              required
                              value={profileFace}
                              onChange={(e) => setProfileFace(e.target.value)}
                              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-neutral-100 text-[11px]"
                            />
                          </div>
                          <div>
                            <label className="block text-[9px] text-neutral-400 mb-1 font-bold uppercase">Грудь *</label>
                            <input
                              type="text"
                              required
                              value={profileChest}
                              onChange={(e) => setProfileChest(e.target.value)}
                              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-neutral-100 text-[11px]"
                            />
                          </div>
                          <div>
                            <label className="block text-[9px] text-neutral-400 mb-1 font-bold uppercase">Талия *</label>
                            <input
                              type="text"
                              required
                              value={profileWaist}
                              onChange={(e) => setProfileWaist(e.target.value)}
                              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-neutral-100 text-[11px]"
                            />
                          </div>
                          <div>
                            <label className="block text-[9px] text-neutral-400 mb-1 font-bold uppercase">Бёдра *</label>
                            <input
                              type="text"
                              required
                              value={profileHips}
                              onChange={(e) => setProfileHips(e.target.value)}
                              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-neutral-100 text-[11px]"
                            />
                          </div>
                          <div>
                            <label className="block text-[9px] text-neutral-400 mb-1 font-bold uppercase">Интим. зоны *</label>
                            <input
                              type="text"
                              required
                              value={profileIntimate}
                              onChange={(e) => setProfileIntimate(e.target.value)}
                              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-neutral-100 text-[11px]"
                            />
                          </div>
                          <div>
                            <label className="block text-[9px] text-neutral-400 mb-1 font-bold uppercase">Ноги *</label>
                            <input
                              type="text"
                              required
                              value={profileLegs}
                              onChange={(e) => setProfileLegs(e.target.value)}
                              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-neutral-100 text-[11px]"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[9px] text-neutral-400 mb-1 font-bold uppercase">Общее состояние и здоровье *</label>
                          <textarea
                            required
                            rows={3}
                            value={profileOverall}
                            onChange={(e) => setProfileOverall(e.target.value)}
                            className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-neutral-100 text-[11px]"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* AI Detailed Analysis and Plot Context section inside profile editing modal */}
                  {(profileDetailedAnalysis || profileImageSceneDescription || profilePlotContext) && (
                    <div className="mt-4 border-t border-neutral-800/80 pt-4 space-y-4 text-left">
                      <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider block">🔮 Углубленный ИИ-Анализ Внешности и Сюжета:</span>
                      
                      <div className="grid grid-cols-1 gap-3">
                        {profileDetailedAnalysis && (
                          <div className="bg-indigo-950/20 border border-indigo-900/30 p-3 rounded-xl space-y-1">
                            <span className="font-bold text-[9px] text-indigo-300 uppercase tracking-wider block">🎨 Психофизический Анализ & Харизма:</span>
                            <p className="text-neutral-300 text-[11px] leading-relaxed whitespace-pre-wrap">{profileDetailedAnalysis}</p>
                          </div>
                        )}

                        {profileImageSceneDescription && (
                          <div className="bg-purple-950/20 border border-purple-900/30 p-3 rounded-xl space-y-1">
                            <span className="font-bold text-[9px] text-purple-300 uppercase tracking-wider block">📸 Описание сцены & одежды на фото:</span>
                            <p className="text-neutral-300 text-[11px] leading-relaxed whitespace-pre-wrap">{profileImageSceneDescription}</p>
                          </div>
                        )}

                        {profilePlotContext && (
                          <div className="bg-rose-950/20 border border-rose-900/30 p-3 rounded-xl space-y-1">
                            <span className="font-bold text-[9px] text-rose-300 uppercase tracking-wider block">📖 Влияние на Сюжет & Реакции Окружающих:</span>
                            <p className="text-neutral-300 text-[11px] leading-relaxed whitespace-pre-wrap">{profilePlotContext}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                </div>

                <div className="p-4 border-t border-neutral-800 flex justify-between items-center bg-neutral-900/90 shrink-0">
                  <button
                    type="button"
                    onClick={handleResetData}
                    className="px-3.5 py-2 bg-red-600/10 hover:bg-red-600/20 border border-red-500/20 text-red-400 rounded-xl font-bold text-[11px] flex items-center gap-1 cursor-pointer transition-all active:scale-[0.98]"
                    title="Сбросить всю игру"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Сбросить всё</span>
                  </button>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowProfileModal(false)}
                      className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl font-bold text-[11px]"
                    >
                      Отмена
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-[11px]"
                    >
                      Сохранить изменения
                    </button>
                  </div>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 5: Character Thoughts and Motives */}
      <AnimatePresence>
        {showThoughtsModal && activeChar && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-neutral-900 border border-purple-500/30 w-full max-w-lg rounded-2xl overflow-hidden shadow-[0_0_50px_rgba(168,85,247,0.2)] flex flex-col text-xs text-neutral-200"
            >
              {/* Header */}
              <div className="p-4 border-b border-neutral-800 bg-neutral-950/40 flex items-center justify-between">
                <div className="flex items-center gap-2.5 text-purple-400">
                  <Brain className="w-5 h-5 animate-pulse text-purple-400" />
                  <div className="text-left">
                    <h3 className="font-bold text-sm text-white">Истинные мысли и мотивы</h3>
                    <p className="text-[10px] text-purple-400/70 font-semibold">{activeChar.name} • Подсознание</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowThoughtsModal(false)}
                  className="text-neutral-400 hover:text-white transition-all cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content viewport */}
              <div className="p-6 overflow-y-auto max-h-[70vh] space-y-5 custom-scrollbar text-left">
                {thoughtsLoading ? (
                  <div className="py-12 flex flex-col items-center justify-center space-y-4">
                    <div className="relative">
                      <Brain className="w-12 h-12 text-purple-500 animate-pulse" />
                    </div>
                    <div className="text-center space-y-1">
                      <p className="text-neutral-300 font-bold text-xs animate-pulse">Проникновение в разум...</p>
                      <p className="text-[10px] text-neutral-500">Считываем истинное отношение, скрытые мотивы и планы {activeChar.name}</p>
                    </div>
                  </div>
                ) : thoughtsError ? (
                  <div className="p-4 bg-red-950/30 border border-red-900/50 rounded-xl space-y-2 text-center">
                    <p className="text-red-400 font-bold">Упс! Произошла ошибка</p>
                    <p className="text-[11px] text-neutral-400 leading-relaxed">{thoughtsError}</p>
                    <button
                      type="button"
                      onClick={handleFetchThoughts}
                      className="px-4 py-1.5 bg-red-900/40 hover:bg-red-900/60 border border-red-800/60 text-red-200 rounded-lg font-bold text-[11px] transition-all cursor-pointer mt-1"
                    >
                      Повторить попытку
                    </button>
                  </div>
                ) : thoughtsData ? (
                  <div className="space-y-5">
                    {/* 1. Thoughts monologue */}
                    <div className="bg-purple-950/25 border border-purple-900/35 p-4 rounded-xl space-y-1.5 relative overflow-hidden">
                      <span className="text-[10px] font-bold text-purple-400 uppercase tracking-widest block">💬 Внутренний монолог (от первого лица):</span>
                      <p className="text-purple-100 italic leading-relaxed text-[11.5px] relative z-10">
                        "{thoughtsData.thoughts}"
                      </p>
                    </div>

                    {/* 2. Hidden Motives */}
                    <div className="bg-neutral-950/50 border border-neutral-800/80 p-4 rounded-xl space-y-1.5">
                      <span className="text-[10px] font-bold text-amber-400 uppercase tracking-widest block">🎯 Скрытые мотивы и цели:</span>
                      <p className="text-neutral-300 leading-relaxed text-[11px]">
                        {thoughtsData.motives}
                      </p>
                    </div>

                    {/* 3. Visual assessment */}
                    <div className="bg-neutral-950/50 border border-neutral-800/80 p-4 rounded-xl space-y-1.5">
                      <span className="text-[10px] font-bold text-rose-400 uppercase tracking-widest block">🍓 Оценка вашей внешности:</span>
                      <p className="text-neutral-300 leading-relaxed text-[11px]">
                        {thoughtsData.visualAttitude}
                      </p>
                    </div>

                    {/* 4. Action plans */}
                    <div className="bg-neutral-950/50 border border-neutral-800/80 p-4 rounded-xl space-y-1.5">
                      <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest block">♟️ План действий в отношении вас:</span>
                      <p className="text-neutral-300 leading-relaxed text-[11px]">
                        {thoughtsData.nextActionPlan}
                      </p>
                    </div>

                    <p className="text-[9px] text-neutral-500 text-center italic mt-2 leading-relaxed">
                      * Внимание! Эти мысли абсолютно честны и раскрывают подлинные намерения персонажа, включая манипуляции, влечение или шантаж, основанные на текущей истории чата и вашем фото.
                    </p>
                  </div>
                ) : null}
              </div>

              {/* Footer action */}
              <div className="p-4 border-t border-neutral-800 bg-neutral-950/40 flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowThoughtsModal(false)}
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-bold text-[11px] shadow-lg shadow-purple-950/50 transition-all cursor-pointer"
                >
                  Понятно
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 5B: Character Characteristics (Optimized for Mobile and Desktop with Scroll and Close) */}
      <AnimatePresence>
        {showCharInfoModal && activeChar && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-neutral-900 border border-neutral-800 w-full max-w-md rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]"
            >
              {/* Header */}
              <div className="p-4 border-b border-neutral-800 bg-neutral-950/40 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2.5 text-indigo-400">
                  <User className="w-5 h-5 text-indigo-400 animate-pulse" />
                  <div className="text-left">
                    <h3 className="font-bold text-sm text-white">Досье Персонажа</h3>
                    <p className="text-[10px] text-indigo-400/70 font-semibold">{activeChar.name} • {activeChar.role}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCharInfoModal(false)}
                  className="p-1.5 hover:bg-neutral-800 rounded-xl text-neutral-400 hover:text-white transition-all cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="p-6 overflow-y-auto space-y-5 custom-scrollbar text-left flex-1">
                {/* Avatar and Main Info Card */}
                <div className="flex items-center gap-4 bg-neutral-950/40 border border-neutral-850 p-4 rounded-xl">
                  <div className={`w-14 h-14 rounded-2xl bg-gradient-to-tr ${activeChar.avatarColor} flex items-center justify-center text-white font-extrabold text-2xl shadow-lg shadow-neutral-950`}>
                    {activeChar.name[0]}
                  </div>
                  <div>
                    <h4 className="font-bold text-base text-neutral-100">{activeChar.name}</h4>
                    <p className="text-xs text-indigo-400 font-semibold">{activeChar.role}</p>
                    <p className="text-[10px] text-neutral-500 mt-0.5">Круг общения: «{activeChar.group}»</p>
                  </div>
                </div>

                {/* Characteristics descriptions */}
                <div className="space-y-3.5 text-xs text-neutral-300">
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider block">🎭 Характер:</span>
                    <p className="bg-neutral-950/30 border border-neutral-850 p-2.5 rounded-lg leading-relaxed">{activeChar.personality}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider block">🗣️ Манера речи:</span>
                    <p className="bg-neutral-950/30 border border-neutral-850 p-2.5 rounded-lg leading-relaxed">{activeChar.speechStyle}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider block">💬 Текущее отношение:</span>
                    <p className="bg-neutral-950/30 border border-neutral-850 p-2.5 rounded-lg leading-relaxed font-semibold text-indigo-300">{activeChar.attitude}</p>
                  </div>
                </div>

                {/* 21+ Relationship Scales */}
                {activeChar.scales && (
                  <div className="pt-4 border-t border-neutral-800 space-y-3">
                    <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider block">
                      📊 Показатели отношений (21+):
                    </span>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                      {/* Trust */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] font-semibold text-neutral-300">
                          <span>🤝 Доверие</span>
                          <span className="text-emerald-400">{(activeChar.scales.trust !== undefined && !isNaN(activeChar.scales.trust)) ? activeChar.scales.trust : 50}%</span>
                        </div>
                        <div className="w-full bg-neutral-950 h-2 rounded-full overflow-hidden border border-neutral-850">
                          <div 
                            className="h-full bg-gradient-to-r from-teal-500 to-emerald-400 transition-all duration-500" 
                            style={{ width: `${(activeChar.scales.trust !== undefined && !isNaN(activeChar.scales.trust)) ? activeChar.scales.trust : 50}%` }}
                          />
                        </div>
                      </div>
                      {/* Love */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] font-semibold text-neutral-300">
                          <span>❤️ Любовь</span>
                          <span className="text-rose-400">{(activeChar.scales.love !== undefined && !isNaN(activeChar.scales.love)) ? activeChar.scales.love : 0}%</span>
                        </div>
                        <div className="w-full bg-neutral-950 h-2 rounded-full overflow-hidden border border-neutral-850">
                          <div 
                            className="h-full bg-gradient-to-r from-pink-500 to-rose-400 transition-all duration-500" 
                            style={{ width: `${(activeChar.scales.love !== undefined && !isNaN(activeChar.scales.love)) ? activeChar.scales.love : 0}%` }}
                          />
                        </div>
                      </div>
                      {/* Lust */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] font-semibold text-neutral-300">
                          <span>🔥 Вожделение</span>
                          <span className="text-purple-400">{(activeChar.scales.lust !== undefined && !isNaN(activeChar.scales.lust)) ? activeChar.scales.lust : 0}%</span>
                        </div>
                        <div className="w-full bg-neutral-950 h-2 rounded-full overflow-hidden border border-neutral-850">
                          <div 
                            className="h-full bg-gradient-to-r from-fuchsia-500 to-purple-400 transition-all duration-500" 
                            style={{ width: `${(activeChar.scales.lust !== undefined && !isNaN(activeChar.scales.lust)) ? activeChar.scales.lust : 0}%` }}
                          />
                        </div>
                      </div>
                      {/* Anger */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] font-semibold text-neutral-300">
                          <span>⚡ Гнев</span>
                          <span className="text-red-400">{(activeChar.scales.anger !== undefined && !isNaN(activeChar.scales.anger)) ? activeChar.scales.anger : 0}%</span>
                        </div>
                        <div className="w-full bg-neutral-950 h-2 rounded-full overflow-hidden border border-neutral-850">
                          <div 
                            className="h-full bg-gradient-to-r from-orange-500 to-red-500 transition-all duration-500" 
                            style={{ width: `${(activeChar.scales.anger !== undefined && !isNaN(activeChar.scales.anger)) ? activeChar.scales.anger : 0}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Fetishes and inclinations traits */}
                {((activeChar.fetishes && activeChar.fetishes.length > 0) || (activeChar.inclinations && activeChar.inclinations.length > 0)) && (
                  <div className="pt-4 border-t border-neutral-800 space-y-3">
                    {activeChar.fetishes && activeChar.fetishes.length > 0 && (
                      <div className="space-y-1.5">
                        <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider block">
                          🍓 Любимые темы / Фетиши:
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {activeChar.fetishes.map((f, i) => (
                            <span key={i} className="text-[10px] bg-rose-500/10 text-rose-300 px-2.5 py-1 rounded-xl border border-rose-500/20 font-semibold">
                              💋 {f}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {activeChar.inclinations && activeChar.inclinations.length > 0 && (
                      <div className="space-y-1.5 mt-3">
                        <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider block">
                          🧠 Склонности и потаенное:
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {activeChar.inclinations.map((inc, i) => (
                            <span key={i} className="text-[10px] bg-indigo-500/10 text-indigo-300 px-2.5 py-1 rounded-xl border border-indigo-500/20 font-semibold">
                              ✨ {inc}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Known rumors/gossip */}
                {visibleFacts.length > 0 && (
                  <div className="pt-4 border-t border-neutral-800 space-y-2">
                    <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block">
                      📢 Известные слухи ({visibleFacts.length}):
                    </span>
                    <div className="space-y-1.5 max-h-36 overflow-y-auto custom-scrollbar">
                      {visibleFacts.map((fact) => (
                        <div key={fact.id} className="bg-neutral-950/40 border border-neutral-850 p-2 rounded-lg text-[11px] text-neutral-300">
                          {fact.text}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Close Button */}
              <div className="p-4 border-t border-neutral-800 bg-neutral-950/40 flex justify-end shrink-0">
                <button
                  type="button"
                  onClick={() => setShowCharInfoModal(false)}
                  className="px-5 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl font-bold text-xs transition-all cursor-pointer"
                >
                  Закрыть
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 5: Immersive Voice Call Screen Overlay */}
      <AnimatePresence>
        {activeCall && activeChar && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/95 backdrop-blur-md p-4 text-xs">
            <motion.div
              initial={{ opacity: 0, y: 50, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 50, scale: 0.95 }}
              className="w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-3xl p-6 text-center flex flex-col justify-between h-[80vh] min-h-[450px] relative overflow-hidden shadow-2xl"
            >
              {/* Soundwaves pattern background */}
              <div className="absolute inset-0 bg-[radial-gradient(#ffffff03_1px,transparent_1px)] [background-size:16px_16px] opacity-40 z-0"></div>

              {/* Header Status */}
              <div className="space-y-1 relative z-10">
                <span className={`text-[10px] ${activeCall.type === "in_person" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/15" : "bg-red-500/10 text-red-400 border border-red-500/15"} px-2.5 py-1 rounded-full font-bold uppercase tracking-wider select-none`}>
                  {activeCall.type === "in_person" ? "🗣️ ЛИЧНЫЙ РАЗГОВОР ВЖИВУЮ" : "🔴 ИДЕТ ЗАПИСЬ ЗВОНКА"}
                </span>
                <p className="text-[11px] text-neutral-500 mt-2">
                  {activeCall.type === "in_person" ? "Личная встреча (Сюжетный отыгрыш рядом)" : "Телефонный разговор (Simulated Text-Call)"}
                </p>
              </div>

              {/* Glowing Caller Avatar */}
              <div className="flex flex-col items-center gap-3 py-6 relative z-10">
                <div className="relative">
                  {/* Pulsing ring */}
                  <span className={`absolute inset-0 rounded-3xl ${activeCall.type === "in_person" ? "bg-emerald-500/25" : "bg-indigo-500/25"} animate-ping opacity-75`}></span>
                  <div className={`w-24 h-24 rounded-3xl bg-gradient-to-tr ${activeChar.avatarColor} flex items-center justify-center text-white font-extrabold text-3xl shadow-xl shadow-neutral-950 relative z-10`}>
                    {activeChar.name[0]}
                  </div>
                </div>

                <div>
                  <h3 className="font-bold text-base text-neutral-100">{activeChar.name}</h3>
                  <p className={`text-[10px] ${activeCall.type === "in_person" ? "text-emerald-400" : "text-indigo-400"} font-semibold`}>{activeChar.role}</p>
                </div>

                <div className="text-xs font-mono text-neutral-300 font-semibold flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${activeCall.type === "in_person" ? "bg-emerald-400" : "bg-indigo-400"} animate-pulse`}></span>
                  {activeCall.status === "calling" ? (
                    <span className="animate-pulse">
                      {activeCall.type === "in_person" ? "Вы подходите ближе..." : "Идет гудок..."}
                    </span>
                  ) : (
                    <span>
                      Соединение • {Math.floor(activeCall.duration / 60).toString().padStart(2, "0")}:
                      {(activeCall.duration % 60).toString().padStart(2, "0")}
                    </span>
                  )}
                </div>
              </div>

              {/* Call Messages / Environment Subtitles Scrollable Area */}
              <div className="flex-1 bg-neutral-950/60 rounded-2xl border border-neutral-850 p-3 space-y-3 overflow-y-auto custom-scrollbar flex flex-col justify-end text-left my-4 relative z-10">
                <div className="text-[9px] text-neutral-500 border-b border-neutral-900 pb-1 mb-1 font-bold select-none text-center">
                  {activeCall.type === "in_person" ? "МЫСЛИ, ВЗГЛЯДЫ И РЕЧЬ ПРИ ВСТРЕЧЕ" : "СУБТИТРЫ ЗВОНКА И ШУМЫ ОКРУЖЕНИЯ"}
                </div>

                {activeCall.status === "calling" ? (
                  <div className="text-neutral-500 italic text-center text-[11px] py-4 select-none animate-pulse">
                    {activeCall.type === "in_person" 
                      ? "[Установление зрительного контакта... Персонаж замечает вас]" 
                      : "[Длинные телефонные гудки... Нарастание шума на линии]"
                    }
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[160px] overflow-y-auto custom-scrollbar">
                    {currentChatMessages.filter(m => activeCall.type === "in_person" ? m.isLive : m.isCall).slice(-4).map(msg => {
                      const isMe = msg.role === "user";
                      return (
                        <div key={msg.id} className="text-[11px] leading-relaxed">
                          <span className={`font-bold ${isMe ? (activeCall.type === "in_person" ? "text-emerald-400" : "text-indigo-400") : "text-amber-400"}`}>
                            {isMe ? "Вы" : activeChar.name}:
                          </span>{" "}
                          <span className="text-neutral-300">{msg.content}</span>
                        </div>
                      );
                    })}
                    <div ref={chatEndRef} />
                  </div>
                )}
              </div>

              {/* Call Input Action or Hangup */}
              <div className="space-y-4 relative z-10">
                
                {activeCall.status === "connected" && (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={callInputText}
                      onChange={(e) => setCallInputText(e.target.value)}
                      placeholder={activeCall.type === "in_person" ? "Скажите что-нибудь вживую..." : "Скажите фразу текстом..."}
                      className={`flex-1 bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2.5 text-neutral-100 placeholder-neutral-700 focus:outline-none ${activeCall.type === "in_person" ? "focus:border-emerald-500" : "focus:border-indigo-500"} text-xs`}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && callInputText.trim() && !isLoading) {
                          handleSendMessage(null as any, callInputText, true);
                        }
                      }}
                    />
                    <button
                      type="button"
                      disabled={!callInputText.trim() || isLoading}
                      onClick={() => handleSendMessage(null as any, callInputText, true)}
                      className={`p-2.5 ${activeCall.type === "in_person" ? "bg-emerald-600 hover:bg-emerald-500" : "bg-indigo-600 hover:bg-indigo-500"} disabled:bg-neutral-800 disabled:text-neutral-600 text-white rounded-xl shadow-md cursor-pointer transition-all shrink-0`}
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                )}

                <div className="flex items-center justify-center">
                  <button
                    onClick={handleHangupCall}
                    className="flex items-center justify-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-500 text-white rounded-2xl shadow-lg shadow-red-950/40 font-bold text-xs cursor-pointer transition-all active:scale-[0.98]"
                  >
                    {activeCall.type === "in_person" ? <X className="w-4 h-4" /> : <PhoneOff className="w-4 h-4" />}
                    <span>{activeCall.type === "in_person" ? "Попрощаться (Завершить)" : "Положить трубку (Завершить)"}</span>
                  </button>
                </div>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Chat Switcher Modal */}
      <AnimatePresence>
        {showChatSwitcherModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/85 backdrop-blur-sm p-4 text-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-2xl flex flex-col h-[85vh] max-h-[600px] overflow-hidden shadow-2xl relative"
            >
              {/* Header */}
              <div className="px-5 py-4 border-b border-neutral-800 bg-neutral-950/40 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-indigo-600/20 flex items-center justify-center text-indigo-400 text-base font-bold select-none">
                    💬
                  </div>
                  <div>
                    <h3 className="font-extrabold text-base text-white">Выбор собеседника</h3>
                    <p className="text-[10px] text-neutral-400">Выберите, кому вы хотите написать, или настройте персонажей</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowChatSwitcherModal(false)}
                  className="p-1.5 hover:bg-neutral-800 text-neutral-400 hover:text-white rounded-lg transition-all cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Action Buttons */}
              <div className="px-5 py-3 border-b border-neutral-800/60 bg-neutral-950/20 flex items-center gap-2 shrink-0">
                <button
                  onClick={() => {
                    setShowChatSwitcherModal(false);
                    openCharacterModal(null);
                  }}
                  className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer text-xs active:scale-95"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Новый персонаж</span>
                </button>
                <button
                  onClick={() => {
                    setShowChatSwitcherModal(false);
                    setShowGroupModal(true);
                  }}
                  className="flex-1 py-2 bg-neutral-850 hover:bg-neutral-800 text-indigo-400 font-semibold rounded-xl flex items-center justify-center gap-1.5 border border-neutral-850 transition-all cursor-pointer text-xs active:scale-95"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Создать группу</span>
                </button>
              </div>

              {/* Scrollable List */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                {/* Group Chats section */}
                {groupChats.length > 0 && (
                  <div className="space-y-1.5">
                    <h4 className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest px-1">Групповые чаты ({groupChats.length})</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {groupChats.map(group => {
                        const isSelected = group.id === selectedChatId;
                        return (
                          <button
                            key={group.id}
                            onClick={() => {
                              setSelectedChatId(group.id);
                              setShowChatSwitcherModal(false);
                            }}
                            className={`flex items-center gap-3 p-2.5 rounded-xl text-left transition-all border cursor-pointer ${
                              isSelected
                                ? "bg-indigo-600/15 border-indigo-500/40 text-white"
                                : "bg-neutral-950/40 border-neutral-850 hover:bg-neutral-800/40 text-neutral-300"
                            }`}
                          >
                            <div className={`w-10 h-10 rounded-xl bg-gradient-to-tr ${group.avatarColor} flex items-center justify-center text-white font-extrabold text-[11px] shadow-md shrink-0`}>
                              {group.name.substring(0, 2).toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="font-bold text-xs truncate">{group.name}</div>
                              <div className="text-[10px] text-neutral-500 truncate">
                                {group.participantIds.length} участников
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Personal Chats Section */}
                <div className="space-y-1.5">
                  <h4 className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest px-1">Личные чаты ({characters.length})</h4>
                  <div className="space-y-2">
                    {characters.map(char => {
                      const isSelected = char.id === selectedChatId;
                      const hasCallOption = true;
                      return (
                        <div
                          key={char.id}
                          className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                            isSelected
                              ? "bg-indigo-600/15 border-indigo-500/40 text-white"
                              : "bg-neutral-950/40 border-neutral-850 hover:bg-neutral-800/40 text-neutral-300"
                          }`}
                        >
                          <button
                            onClick={() => {
                              setSelectedChatId(char.id);
                              setShowChatSwitcherModal(false);
                            }}
                            className="flex items-center gap-3 text-left flex-1 min-w-0 cursor-pointer"
                          >
                            <div className={`w-10 h-10 rounded-xl bg-gradient-to-tr ${char.avatarColor} flex items-center justify-center text-white font-bold text-sm shadow-md shrink-0`}>
                              {char.name[0]}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-xs truncate text-neutral-100">{char.name}</span>
                                <span className="text-[8px] bg-neutral-800 text-indigo-400 px-1.5 py-0.5 rounded-full font-bold">
                                  {char.group}
                                </span>
                              </div>
                              <div className="text-[10px] text-neutral-400 font-medium truncate mt-0.5">
                                {char.role}
                              </div>
                              <div className="flex items-center gap-2 mt-1 text-[8px] flex-wrap">
                                <span className="text-emerald-400 font-semibold">● {char.status}</span>
                                <span className="text-neutral-500">• Отношение: <span className="text-pink-400 font-semibold">{char.attitude}</span></span>
                              </div>
                            </div>
                          </button>

                          <div className="flex items-center gap-1.5 ml-2">
                            {hasCallOption && (
                              <button
                                onClick={() => {
                                  setSelectedChatId(char.id);
                                  setShowChatSwitcherModal(false);
                                  setActiveCall({
                                    characterId: char.id,
                                    status: "calling",
                                    duration: 0,
                                    type: "phone"
                                  });
                                  setTimeout(() => {
                                    setActiveCall(prev => {
                                      if (!prev) return null;
                                      return { ...prev, status: "connected" };
                                    });
                                  }, 2500);
                                }}
                                title="Позвонить"
                                className="w-8 h-8 rounded-lg bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 flex items-center justify-center cursor-pointer transition-all active:scale-90"
                              >
                                <Phone className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              onClick={() => {
                                setShowChatSwitcherModal(false);
                                openCharacterModal(char.id);
                              }}
                              title="Редактировать характер"
                              className="w-8 h-8 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white flex items-center justify-center cursor-pointer transition-all active:scale-90"
                            >
                              <PenSquare className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-5 py-3 border-t border-neutral-800 bg-neutral-950/60 text-center text-[10px] text-neutral-500 shrink-0 select-none font-bold">
                🔒 Все переписки хранятся локально на вашем устройстве
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Reset Confirmation Modal */}
      <AnimatePresence>
        {showResetConfirm && (
          <div className="fixed inset-0 z-55 flex items-center justify-center bg-neutral-950/85 backdrop-blur-sm p-4 text-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-2xl relative"
            >
              <div className="text-center space-y-4">
                <div className="w-12 h-12 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center text-xl mx-auto">
                  ⚠️
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-white">Начать всё сначала?</h3>
                  <p className="text-[11px] text-neutral-400 mt-2 leading-relaxed">
                    Вы уверены, что хотите полностью стереть историю переписок, созданные группы, измененные характеры персонажей и сюжет? Это действие необратимо.
                  </p>
                </div>
                <div className="flex gap-2.5 pt-2">
                  <button
                    onClick={() => setShowResetConfirm(false)}
                    className="flex-1 py-2.5 bg-neutral-800 hover:bg-neutral-750 text-neutral-300 font-bold rounded-xl transition-all cursor-pointer text-[11px]"
                  >
                    Отмена
                  </button>
                  <button
                    onClick={executeResetData}
                    className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl transition-all cursor-pointer shadow-lg shadow-red-950/40 text-[11px]"
                  >
                    Да, стереть всё
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Character Confirmation Modal */}
      <AnimatePresence>
        {charIdToDelete && (
          <div className="fixed inset-0 z-55 flex items-center justify-center bg-neutral-950/85 backdrop-blur-sm p-4 text-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-2xl relative"
            >
              <div className="text-center space-y-4">
                <div className="w-12 h-12 bg-amber-500/10 text-amber-500 rounded-full flex items-center justify-center text-xl mx-auto">
                  🗑️
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-white">Удалить персонажа?</h3>
                  <p className="text-[11px] text-neutral-400 mt-2 leading-relaxed">
                    Вы уверены, что хотите удалить этого персонажа? Вся переписка и история чата с ним будут безвозвратно стерты.
                  </p>
                </div>
                <div className="flex gap-2.5 pt-2">
                  <button
                    onClick={() => setCharIdToDelete(null)}
                    className="flex-1 py-2.5 bg-neutral-800 hover:bg-neutral-750 text-neutral-300 font-bold rounded-xl transition-all cursor-pointer text-[11px]"
                  >
                    Отмена
                  </button>
                  <button
                    onClick={() => executeDeleteCharacter(charIdToDelete)}
                    className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl transition-all cursor-pointer shadow-lg shadow-amber-950/40 text-[11px]"
                  >
                    Удалить
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
