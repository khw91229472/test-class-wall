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

  // 내가 쓴 메모이거나, uid가 없는 기존 메모인 경우에만 삭제 버튼 표시
  const canDelete = !memo.uid || (currentUser && memo.uid === currentUser.uid);

  if (canDelete) {
    const del = document.createElement("button");
    del.textContent = "×";
    del.title = "메모 삭제";
    del.addEventListener("click", async function () {
      await deleteMemo(memo.id);
      await render();
    });
    div.appendChild(del);
  }

  const span = document.createElement("span");
  span.textContent = memo.text;
  div.appendChild(span);

  return div;
}


// ===================================================
// 사용자 로그인 영역 (백엔드 2: Google 로그인)
// ===================================================

const userArea = document.getElementById("userArea");

function renderUserArea() {
  userArea.innerHTML = "";

  if (currentUser) {
    // 로그인된 상태: 사용자 이름과 로그아웃 버튼 표시
    const greeting = document.createElement("span");
    greeting.textContent = (currentUser.displayName || "로그인 사용자") + "님 환영합니다!";

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

