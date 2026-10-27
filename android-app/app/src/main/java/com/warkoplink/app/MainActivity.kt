package com.warkoplink.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChatBubbleOutline
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.PersonOutline
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
import com.google.firebase.firestore.Query

private val WarkopBlue = Color(0xFF185ADB)
private val WarkopInk = Color(0xFF17233C)
private val Muted = Color(0xFF68758A)
private val Topics = listOf("Obrolan Umum", "Tanya Jawab", "Info Layanan", "Ide & Saran")

private object FirebaseRuntime {
    var auth: FirebaseAuth? = null
    var db: FirebaseFirestore? = null
    var configurationError: String? = null

    fun initialize(activity: ComponentActivity) {
        val apiKey = BuildConfig.FIREBASE_API_KEY
        val appId = BuildConfig.FIREBASE_APP_ID
        val projectId = BuildConfig.FIREBASE_PROJECT_ID
        val senderId = BuildConfig.FIREBASE_SENDER_ID
        if (apiKey.isBlank() || appId.isBlank() || projectId.isBlank() || senderId.isBlank()) {
            configurationError = "Firebase belum dikonfigurasi untuk APK ini. Build dengan firebaseApiKey, firebaseAppId, firebaseProjectId, dan firebaseSenderId."
            return
        }
        try {
            val options = FirebaseOptions.Builder()
                .setApiKey(apiKey)
                .setApplicationId(appId)
                .setProjectId(projectId)
                .setGcmSenderId(senderId)
                .build()
            val app = FirebaseApp.getApps(activity).firstOrNull()
                ?: FirebaseApp.initializeApp(activity, options)
            auth = FirebaseAuth.getInstance(app)
            db = FirebaseFirestore.getInstance(app)
            configurationError = null
        } catch (e: Exception) {
            configurationError = "Firebase gagal dimulai: ${e.localizedMessage ?: "periksa konfigurasi"}"
        }
    }
}

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        FirebaseRuntime.initialize(this)
        setContent {
            MaterialTheme(
                colorScheme = lightColorScheme(
                    primary = WarkopBlue,
                    secondary = Color(0xFF7655D9),
                    background = Color(0xFFF7F8FC),
                    surface = Color.White
                )
            ) { WarkopLinkApp() }
        }
    }
}

private data class CommunityPost(
    val id: String,
    val authorId: String,
    val authorName: String,
    val body: String,
    val topic: String,
    val totalReactions: Long
)

@Composable
private fun WarkopLinkApp() {
    val auth = FirebaseRuntime.auth
    var user by remember { mutableStateOf(auth?.currentUser) }
    var selectedTab by remember { mutableStateOf(0) }
    var profileName by remember { mutableStateOf("") }
    var posts by remember { mutableStateOf(emptyList<CommunityPost>()) }
    var loadingPosts by remember { mutableStateOf(false) }
    var feedError by remember { mutableStateOf<String?>(null) }

    DisposableEffect(auth) {
        if (auth == null) return@DisposableEffect onDispose { }
        val listener = FirebaseAuth.AuthStateListener { user = it.currentUser }
        auth.addAuthStateListener(listener)
        onDispose { auth.removeAuthStateListener(listener) }
    }

    DisposableEffect(user?.uid, FirebaseRuntime.db) {
        val db = FirebaseRuntime.db
        val currentUser = user
        if (db == null || currentUser == null) {
            posts = emptyList()
            loadingPosts = false
            return@DisposableEffect onDispose { }
        }
        loadingPosts = true
        val registration: ListenerRegistration = db.collection("profiles").document(currentUser.uid)
            .addSnapshotListener { snapshot, _ ->
                profileName = snapshot?.getString("displayName").orEmpty()
                    .ifBlank { currentUser.email?.substringBefore("@").orEmpty() }
            }
        val feedRegistration = db.collection("posts")
            .orderBy("createdAt", Query.Direction.DESCENDING)
            .limit(50)
            .addSnapshotListener { snapshot, error ->
                loadingPosts = false
                if (error != null) {
                    feedError = "Feed belum bisa dimuat. Periksa koneksi dan aturan akses."
                    return@addSnapshotListener
                }
                feedError = null
                posts = snapshot?.documents.orEmpty().map { doc ->
                    CommunityPost(
                        id = doc.id,
                        authorId = doc.getString("authorId").orEmpty(),
                        authorName = doc.getString("authorName").orEmpty().ifBlank { "Anggota" },
                        body = doc.getString("body").orEmpty(),
                        topic = doc.getString("topic").orEmpty(),
                        totalReactions = doc.getLong("totalReactions") ?: 0L
                    )
                }
            }
        onDispose {
            registration.remove()
            feedRegistration.remove()
        }
    }

    if (FirebaseRuntime.configurationError != null) {
        SetupScreen(FirebaseRuntime.configurationError!!)
        return
    }
    if (auth == null || FirebaseRuntime.db == null) {
        SetupScreen("Firebase belum tersedia. Pastikan konfigurasi aplikasi valid.")
        return
    }
    if (user == null) {
        AuthScreen(
            onSignIn = { email, password, _, done -> auth.signInWithEmailAndPassword(email, password).addOnCompleteListener { done(it.exception) } },
            onSignUp = { email, password, name, done ->
                auth.createUserWithEmailAndPassword(email, password).addOnSuccessListener { result ->
                    val uid = result.user?.uid
                    if (uid == null) {
                        done(IllegalStateException("Akun dibuat tetapi sesi tidak tersedia."))
                    } else {
                        val now = FieldValue.serverTimestamp()
                        FirebaseRuntime.db!!.collection("profiles").document(uid).set(
                            mapOf("displayName" to name.trim(), "email" to email.trim(), "createdAt" to now, "updatedAt" to now)
                        ).addOnSuccessListener { done(null) }
                            .addOnFailureListener { error ->
                                auth.signOut()
                                done(error)
                            }
                    }
                }.addOnFailureListener { done(it) }
            }
        )
        return
    }

    Scaffold(
        topBar = {
            Column(Modifier.fillMaxWidth().background(Color.White).padding(horizontal = 18.dp, vertical = 12.dp)) {
                Text("WarkopLink", fontSize = 23.sp, fontWeight = FontWeight.ExtraBold, color = WarkopInk)
                Text(
                    when (selectedTab) { 0 -> "Komunitas Lamongan"; 1 -> "Ruang obrolan"; else -> "Akun anggota" },
                    color = Muted, fontSize = 13.sp
                )
            }
        },
        bottomBar = {
            NavigationBar(containerColor = Color.White) {
                NavigationBarItem(selected = selectedTab == 0, onClick = { selectedTab = 0 },
                    icon = { androidx.compose.material3.Icon(Icons.Default.Groups, contentDescription = "Komunitas") }, label = { Text("Komunitas") })
                NavigationBarItem(selected = selectedTab == 1, onClick = { selectedTab = 1 },
                    icon = { androidx.compose.material3.Icon(Icons.Default.ChatBubbleOutline, contentDescription = "Obrolan") }, label = { Text("Obrolan") })
                NavigationBarItem(selected = selectedTab == 2, onClick = { selectedTab = 2 },
                    icon = { androidx.compose.material3.Icon(Icons.Default.PersonOutline, contentDescription = "Profil") }, label = { Text("Profil") })
            }
        }
    ) { padding ->
        Surface(Modifier.fillMaxSize().padding(padding), color = MaterialTheme.colorScheme.background) {
            when (selectedTab) {
                0 -> FeedScreen(posts, loadingPosts, feedError, profileName, "Bagikan sesuatu ke komunitas") { body, topic, done ->
                    createPost(user!!, profileName, body, topic, done)
                }
                1 -> FeedScreen(posts, loadingPosts, feedError, profileName, "Mulai percakapan baru") { body, topic, done ->
                    createPost(user!!, profileName, body, topic, done)
                }
                else -> ProfileScreen(user!!, profileName) { auth.signOut(); selectedTab = 0 }
            }
        }
    }
}

private fun createPost(user: FirebaseUser, name: String, body: String, topic: String, done: (String?) -> Unit) {
    val reactions = mapOf("like" to 0, "love" to 0, "haha" to 0, "wow" to 0, "sad" to 0, "angry" to 0)
    FirebaseRuntime.db!!.collection("posts").add(
        mapOf(
            "authorId" to user.uid,
            "authorName" to name.ifBlank { user.email?.substringBefore("@") ?: "Anggota" },
            "body" to body.trim(),
            "topic" to topic,
            "createdAt" to FieldValue.serverTimestamp(),
            "reactions" to reactions,
            "totalReactions" to 0
        )
    ).addOnSuccessListener { done(null) }.addOnFailureListener {
        done("Posting gagal. Periksa profil dan aturan Firestore.")
    }
}

@Composable
private fun AuthScreen(
    onSignIn: (String, String, String, (Exception?) -> Unit) -> Unit,
    onSignUp: (String, String, String, (Exception?) -> Unit) -> Unit
) {
    var isSignUp by remember { mutableStateOf(false) }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var name by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    Column(
        Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center
    ) {
        Text("WarkopLink", fontSize = 32.sp, fontWeight = FontWeight.ExtraBold, color = WarkopInk)
        Spacer(Modifier.height(6.dp))
        Text(if (isSignUp) "Buat akun untuk bergabung." else "Masuk untuk mengikuti obrolan komunitas.", color = Muted)
        Spacer(Modifier.height(22.dp))
        if (isSignUp) {
            OutlinedTextField(name, { name = it }, Modifier.fillMaxWidth(), label = { Text("Nama tampilan") }, singleLine = true)
            Spacer(Modifier.height(10.dp))
        }
        OutlinedTextField(email, { email = it }, Modifier.fillMaxWidth(), label = { Text("Email") }, singleLine = true)
        Spacer(Modifier.height(10.dp))
        OutlinedTextField(password, { password = it }, Modifier.fillMaxWidth(), label = { Text("Kata sandi") }, singleLine = true, visualTransformation = PasswordVisualTransformation())
        if (error != null) {
            Spacer(Modifier.height(8.dp))
            Text(error!!, color = Color(0xFFB42318), fontSize = 13.sp)
        }
        Spacer(Modifier.height(16.dp))
        Button(
            onClick = {
                if (email.isBlank() || password.length < 6 || (isSignUp && name.trim().length < 2)) {
                    error = if (isSignUp) "Isi nama (min. 2 karakter), email, dan sandi minimal 6 karakter." else "Isi email dan sandi minimal 6 karakter."
                    return@Button
                }
                busy = true; error = null
                val callback: (Exception?) -> Unit = { e -> busy = false; error = e?.localizedMessage }
                if (isSignUp) onSignUp(email.trim(), password, name, callback)
                else onSignIn(email.trim(), password, name, callback)
            },
            enabled = !busy,
            modifier = Modifier.fillMaxWidth()
        ) {
            if (busy) CircularProgressIndicator(Modifier.width(18.dp).height(18.dp), strokeWidth = 2.dp, color = Color.White)
            else Text(if (isSignUp) "Buat akun" else "Masuk")
        }
        TextButton(onClick = { isSignUp = !isSignUp; error = null }, modifier = Modifier.align(Alignment.CenterHorizontally)) {
            Text(if (isSignUp) "Sudah punya akun? Masuk" else "Belum punya akun? Daftar")
        }
    }
}

@Composable
private fun FeedScreen(
    posts: List<CommunityPost>,
    loading: Boolean,
    error: String?,
    profileName: String,
    prompt: String,
    onPost: (String, String, (String?) -> Unit) -> Unit
) {
    var body by remember { mutableStateOf("") }
    var topicIndex by remember { mutableStateOf(0) }
    var sending by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
    Column(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxWidth().background(Color.White).padding(14.dp)) {
            OutlinedTextField(
                value = body, onValueChange = { if (it.length <= 2000) body = it },
                modifier = Modifier.fillMaxWidth(), placeholder = { Text(prompt) },
                minLines = 2, maxLines = 5
            )
            Spacer(Modifier.height(8.dp))
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                TextButton(onClick = { topicIndex = (topicIndex + 1) % Topics.size }) {
                    Text("Topik: ${Topics[topicIndex]}  ▾", fontSize = 12.sp)
                }
                Button(
                    onClick = {
                        if (body.isBlank()) { message = "Tulis pesan terlebih dahulu."; return@Button }
                        sending = true; message = null
                        onPost(body, Topics[topicIndex]) { result ->
                            sending = false
                            message = result ?: "Posting terkirim."
                            if (result == null) body = ""
                        }
                    }, enabled = !sending && body.isNotBlank()
                ) { Text(if (sending) "Mengirim…" else "Posting") }
            }
            if (message != null) Text(message!!, color = if (message!!.contains("gagal")) Color(0xFFB42318) else Muted, fontSize = 12.sp)
        }
        HorizontalDivider(color = Color(0xFFE7EAF0))
        if (error != null) Text(error, modifier = Modifier.padding(16.dp), color = Color(0xFFB42318))
        if (loading && posts.isEmpty()) Box(Modifier.fillMaxWidth().padding(28.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        else if (posts.isEmpty()) {
            Column(Modifier.fillMaxWidth().padding(28.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Text("Belum ada postingan", fontWeight = FontWeight.Bold, color = WarkopInk)
                Text("Jadilah yang pertama memulai obrolan.", color = Muted, fontSize = 13.sp)
            }
        } else {
            LazyColumn(Modifier.fillMaxSize()) {
                items(posts, key = { it.id }) { post ->
                    Column(Modifier.fillMaxWidth().background(Color.White).padding(horizontal = 16.dp, vertical = 13.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(Modifier.background(WarkopBlue.copy(alpha = 0.1f), CircleShape).padding(horizontal = 11.dp, vertical = 8.dp)) {
                                Text(post.authorName.take(1).uppercase(), color = WarkopBlue, fontWeight = FontWeight.Bold)
                            }
                            Spacer(Modifier.width(10.dp))
                            Column {
                                Text(post.authorName, fontWeight = FontWeight.SemiBold, color = WarkopInk, fontSize = 14.sp)
                                Text(post.topic, color = Muted, fontSize = 12.sp)
                            }
                        }
                        Spacer(Modifier.height(8.dp))
                        Text(post.body, color = WarkopInk, fontSize = 15.sp, lineHeight = 21.sp)
                        Spacer(Modifier.height(10.dp))
                        Text("♡  ${post.totalReactions} reaksi", color = Muted, fontSize = 12.sp)
                    }
                    HorizontalDivider(color = Color(0xFFE7EAF0))
                }
            }
        }
    }
}

@Composable
private fun ProfileScreen(user: FirebaseUser, displayName: String, onSignOut: () -> Unit) {
    Column(Modifier.fillMaxSize().padding(22.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Box(Modifier.background(WarkopBlue.copy(alpha = 0.1f), CircleShape).padding(20.dp)) {
            Text(displayName.take(1).uppercase().ifBlank { "W" }, fontSize = 28.sp, color = WarkopBlue, fontWeight = FontWeight.Bold)
        }
        Text(displayName.ifBlank { "Anggota WarkopLink" }, fontSize = 24.sp, fontWeight = FontWeight.Bold, color = WarkopInk)
        Text(user.email.orEmpty(), color = Muted)
        Text("Akun terhubung dengan Firebase Authentication.", color = Muted, fontSize = 13.sp)
        Spacer(Modifier.height(8.dp))
        OutlinedButton(onClick = onSignOut, modifier = Modifier.fillMaxWidth()) { Text("Keluar akun") }
    }
}

@Composable
private fun SetupScreen(message: String) {
    Column(Modifier.fillMaxSize().padding(26.dp), verticalArrangement = Arrangement.Center) {
        Text("WarkopLink", fontSize = 30.sp, fontWeight = FontWeight.ExtraBold, color = WarkopInk)
        Spacer(Modifier.height(12.dp))
        Text("Konfigurasi Firebase diperlukan", fontSize = 20.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(8.dp))
        Text(message, color = Muted)
    }
}
