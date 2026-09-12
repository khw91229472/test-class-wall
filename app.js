// ===================================================
// 우리 반 담벼락 - Firebase Firestore 연동
//
// Firebase Firestore를 연결하여 메모를 서버에 영구 저장합니다.
// ===================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  updateDoc,
  doc,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

// Firebase 설정 정보
const firebaseConfig = {
  apiKey: "AIzaSyDkPEFjcjsGCDIKq_Kch7WsmiAaIhu0ki4",
  authDomain: "test-class-wall0912.firebaseapp.com",
  projectId: "test-class-wall0912",
  storageBucket: "test-class-wall0912.firebasestorage.app",
  messagingSenderId: "474856369491",
  appId: "1:474856369491:web:7c228337d9050cfff445a6"
};

// Firebase 및 서비스 초기화
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// 현재 로그인한 사용자 정보
let currentUser = null;

// ===================================================
// 사용자 역할 구분 (UID 기준: 교사 teacher / 학생 student)
// ===================================================

// 교사 UID 목록 (교사 권한을 부여할 구글 계정 UID)
const TEACHER_UIDS = [
  "5KZWUvaJsGVhfd7Gk9HIJTsIwtY2" // 기본 교사 계정
];

// 사용자의 역할을 확인하는 함수 ('teacher' 또는 'student')
function getUserRole(user) {
  if (!user) return null;
  return TEACHER_UIDS.includes(user.uid) ? "teacher" : "student";
}


// ===================================================
// 데이터를 다루는 함수 세 개 (Firestore 연동)
// ===================================================

// 메모를 읽어 옵니다.
// Firestore의 memos 컬렉션에서 작성 시각(createdAt) 순으로 가져옵니다.
async function loadMemos() {
  const q = query(collection(db, "memos"), orderBy("createdAt", "asc"));
  const querySnapshot = await getDocs(q);
  const memos = [];
  querySnapshot.forEach(function (docSnap) {
    memos.push({
      id: docSnap.id,
      ...docSnap.data()
    });
  });
  return memos;
}

// 메모를 새로 씁니다.
// 입력 내용이 5글자 이상일 때만 Firestore에 저장합니다.
// 백엔드 2: 여기에 "누가 썼는지"(uid)를 함께 저장하게 됩니다.
async function addMemo(text) {
  if (!text || text.trim().length < 5) {
    throw new Error("메모는 5글자 이상이어야 합니다.");
  }

  const memoData = {
    text: text.trim(),
    createdAt: Date.now()
  };

  // 로그인한 사용자가 있다면 uid를 함께 저장
  if (currentUser) {
    memoData.uid = currentUser.uid;
  }

  await addDoc(collection(db, "memos"), memoData);
}

// 메모를 지웁니다.
// 백엔드 2: 지금은 누구든 남의 메모를 지울 수 있습니다. 이걸 막는 것이 과제입니다.
async function deleteMemo(id) {
  await deleteDoc(doc(db, "memos", id));
}


// ===================================================
// 화면 그리기
// ===================================================

async function render() {
  const wall = document.getElementById("wall");
  wall.innerHTML = "";

  const memos = await loadMemos();
  memos.forEach(function (memo) {
    wall.appendChild(makeMemo(memo));
  });
}

// 메모 한 장 만들기
function makeMemo(memo) {
  const div = document.createElement("div");
  div.className = "memo";

  const role = getUserRole(currentUser);
  // 교사는 모든 메모 삭제 가능, 학생은 본인이 작성한 메모만 삭제 가능 (다른 사람 것은 건들지 못함)
  const isTeacher = role === "teacher";
  const isMyMemo = currentUser && memo.uid === currentUser.uid;
  const canDelete = isTeacher || isMyMemo;

  if (canDelete) {
    const del = document.createElement("button");
    del.className = "del-btn";
    del.textContent = "×";
    del.title = isTeacher && !isMyMemo ? "교사 권한으로 삭제" : "내 메모 삭제";
    del.addEventListener("click", async function () {
      await deleteMemo(memo.id);
      await render();
    });
    div.appendChild(del);
  }

  const span = document.createElement("span");
  span.textContent = memo.text;
  div.appendChild(span);

  // 이미 생성된 AI 코멘트가 있다면 표시
  if (memo.aiComment) {
    const commentBox = document.createElement("div");
    commentBox.className = "ai-comment";
    commentBox.textContent = "🤖 AI 코멘트: " + memo.aiComment;
    div.appendChild(commentBox);
  }

  // 교사에게만 [🤖 AI 코멘트 달기] 버튼 표시
  if (isTeacher) {
    const aiBtn = document.createElement("button");
    aiBtn.className = "ai-btn";
    aiBtn.textContent = memo.aiComment ? "🤖 AI 코멘트 다시 달기" : "🤖 AI 코멘트 달기";
    aiBtn.addEventListener("click", async function () {
      aiBtn.disabled = true;
      aiBtn.textContent = "🤖 코멘트 작성 중...";

      try {
        await addAiComment(memo);
        await render();
      } catch (error) {
        console.error("AI 코멘트 생성 오류:", error);
        alert("AI 코멘트를 생성하지 못했습니다: " + error.message);
        aiBtn.disabled = false;
        aiBtn.textContent = memo.aiComment ? "🤖 AI 코멘트 다시 달기" : "🤖 AI 코멘트 달기";
      }
    });
    div.appendChild(aiBtn);
  }

  return div;
}

// ===================================================
// AI 코멘트 생성 함수 (Gemini API 연동)
//
// 교사가 버튼을 클릭했을 때 호출됩니다.
// 1) Vercel 서버리스 함수(/api/gemini)를 통해 안전하게 코멘트를 받아옵니다.
// 2) 로컬 환경(Live Server) 등 서버리스 함수 미동작 시 브라우저에서 직접 테스트할 수 있도록 지원합니다.
// 3) 개인정보 보호: 학생 이름이나 uid는 전달하지 않고 오직 메모 내용(text)만 보냅니다.
// ===================================================
async function addAiComment(memo) {
  let comment = "";

  try {
    // 1. Vercel 서버리스 함수(/api/gemini) 호출
    const res = await fetch("/api/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: memo.text })
    });

    if (res.ok) {
      const data = await res.json();
      comment = data.comment;
    } else {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `서버 오류 (${res.status})`);
    }
  } catch (serverError) {
    console.warn("Vercel 서버리스 함수 호출 실패 (로컬 환경 등):", serverError);

    // 로컬 Live Server 환경 fallback: 브라우저에서 직접 무료 모델(gemini-1.5-flash) 호출
    let localApiKey = localStorage.getItem("local_gemini_api_key");
    if (!localApiKey) {
      localApiKey = prompt(
        "로컬 환경(Live Server)에서는 /api/gemini 서버리스 함수가 실행되지 않습니다.\n\n로컬에서 즉시 테스트하시려면 Gemini API 키를 입력해 주세요 (브라우저 로컬 저장소에만 보관됩니다):\n\n* Vercel 배포 시에는 환경변수(GEMINI_API_KEY)로 자동 동작합니다."
      );
      if (localApiKey && localApiKey.trim()) {
        localStorage.setItem("local_gemini_api_key", localApiKey.trim());
      } else {
        throw new Error("Gemini API 키가 입력되지 않았습니다.");
      }
    }

    const localRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${localApiKey.trim()}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `당신은 학생들을 따뜻하게 격려하는 초·중등학교 교사입니다. 학생이 학급 담벼락에 쓴 다음 메모를 읽고, 따뜻한 칭찬과 응원의 한마디(1~2문장의 친근한 존댓말)를 남겨주세요.\n\n메모: "${memo.text}"`
                }
              ]
            }
          ]
        })
      }
    );

    if (!localRes.ok) {
      const localErr = await localRes.json().catch(() => ({}));
      if (localRes.status === 400 || localRes.status === 403) {
        localStorage.removeItem("local_gemini_api_key");
      }
      throw new Error(localErr.error?.message || "Gemini API 호출에 실패했습니다.");
    }

    const localData = await localRes.json();
    comment = localData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  }

  if (!comment) {
    throw new Error("생성된 코멘트가 없습니다.");
  }

  // Firestore의 해당 메모 문서에 aiComment 필드 업데이트
  await updateDoc(doc(db, "memos", memo.id), {
    aiComment: comment
  });
}


// ===================================================
// 사용자 로그인 영역 (백엔드 2: Google 로그인)
// ===================================================

const userArea = document.getElementById("userArea");

function renderUserArea() {
  userArea.innerHTML = "";

  if (currentUser) {
    const role = getUserRole(currentUser);
    const roleBadge = role === "teacher" ? "👨‍🏫 교사" : "🧑‍🎓 학생";

    // 로그인된 상태: 역할, 사용자 이름과 로그아웃 버튼 표시
    const greeting = document.createElement("span");
    greeting.textContent = `[${roleBadge}] ${currentUser.displayName || "사용자"}님 환영합니다!`;

    const logoutBtn = document.createElement("button");
    logoutBtn.textContent = "로그아웃";
    logoutBtn.addEventListener("click", async function () {
      try {
        await signOut(auth);
      } catch (error) {
        console.error("로그아웃 실패:", error);
      }
    });

    userArea.appendChild(greeting);
    userArea.appendChild(logoutBtn);
  } else {
    // 로그아웃된 상태: 구글 로그인 버튼 표시
    const guide = document.createElement("span");
    guide.textContent = "메모를 남기려면 로그인해 주세요.";

    const loginBtn = document.createElement("button");
    loginBtn.textContent = "Google 로그인";
    loginBtn.addEventListener("click", async function () {
      try {
        await signInWithPopup(auth, provider);
      } catch (error) {
        console.error("Google 로그인 실패:", error);
        alert("로그인에 실패했습니다: " + error.message);
      }
    });

    userArea.appendChild(guide);
    userArea.appendChild(loginBtn);
  }
}

// 로그인 상태 변경 감지
onAuthStateChanged(auth, function (user) {
  currentUser = user;
  renderUserArea();
  render(); // 로그인 상태에 맞춰 삭제 버튼 등 담벼락 갱신
});


// ===================================================
// 메모 쓰는 칸
// 엔터를 누르면 담벼락에 붙습니다 (줄바꿈은 Shift + 엔터)
// ===================================================

const input = document.getElementById("input");

input.addEventListener("keydown", async function (e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();

    if (!currentUser) {
      alert("로그인 후 메모를 작성할 수 있습니다.");
      return;
    }

    const text = input.value.trim();
    if (text === "") return;

    // 5글자 이상인지 클라이언트에서 1차 검사
    if (text.length < 5) {
      alert("메모는 5글자 이상 입력해 주세요.");
      return;
    }

    try {
      await addMemo(text);
      input.value = "";
      await render();
    } catch (error) {
      console.error("메모 저장 실패:", error);
      alert("메모를 저장하지 못했습니다: " + error.message);
    }
  }
});


// 첫 화면 그리기
render();
input.focus();

