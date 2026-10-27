package com.warkoplink.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
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
                ?: throw IllegalStateException("Firebase app tidak dapat diinisialisasi")
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
    val totalReactions: Long,
    val reactions: Map<String, Long>
)

private data class CommunityReply(
    val id: String,
    val authorName: String,
    val body: String
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
                        totalReactions = doc.getLong("totalReactions") ?: 0L,
                        reactions = (doc.get("reactions") as? Map<*, *>)
                            ?.mapNotNull { (key, value) -> if (key is String && value is Number) key to value.toLong() else null }
                            ?.toMap().orEmpty()
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
                0 -> FeedScreen(posts, loadingPosts, feedError, profileName, user!!.uid, "Bagikan sesuatu ke komunitas",
                    onPost = { body, topic, done -> createPost(user!!, profileName, body, topic, done) },
                    onReact = { postId, emoji, done -> toggleReaction(user!!, postId, emoji, done) })
                1 -> FeedScreen(posts, loadingPosts, feedError, profileName, user!!.uid, "Mulai percakapan baru",
                    onPost = { body, topic, done -> createPost(user!!, profileName, body, topic, done) },
                    onReact = { postId, emoji, done -> toggleReaction(user!!, postId, emoji, done) })
                else -> ProfileScreen(user!!, profileName) { auth.signOut(); selectedTab = 0 }
            }
        }
    }
}

private fun createPost(user: FirebaseUser, name: String, body: String, topic: String, done: (String?) -> Unit) {
    val db = FirebaseRuntime.db ?: run { done("Firebase belum dikonfigurasi."); return }
    db.collection("profiles").document(user.uid).get()
        .addOnSuccessListener { profile ->
            val authorName = profile.getString("displayName")
            if (authorName.isNullOrBlank()) {
                done("Profil belum siap. Coba lagi sebentar.")
                return@addOnSuccessListener
            }
            val reactions = ReactionOptions.take(6).associate { (key, _) -> key to 0 }
            db.collection("posts").add(
                mapOf(
                    "authorId" to user.uid,
                    "authorName" to authorName,
                    "body" to body.trim(),
                    "topic" to topic,
                    "createdAt" to FieldValue.serverTimestamp(),
                    "reactions" to reactions,
                    "totalReactions" to 0
                )
            ).addOnSuccessListener { done(null) }.addOnFailureListener {
                done("Posting gagal. Periksa profil dan aturan Firestore.")
            }
        }.addOnFailureListener { done("Profil gagal diperiksa. Periksa koneksi.") }
}

private val ReactionOptions = listOf(
    "like" to "👍",
    "love" to "❤️",
    "haha" to "😂",
    "wow" to "😮",
    "sad" to "😢",
    "angry" to "😡",
    "thumbs_down" to "👎",
    "fire" to "🔥",
    "party" to "🎉",
    "star_eyes" to "🤩",
    "scream" to "😱",
    "poop" to "💩",
    "vomit" to "🤮",
    "broken_heart" to "💔",
    "smiling_hearts" to "🥰",
    "heart_eyes" to "😍",
    "sunglasses" to "😎",
    "nerd" to "🤓",
    "thinking" to "🤔",
    "salute" to "🫡",
    "handshake" to "🤝",
    "clap" to "👏",
    "pray" to "🙏",
    "hundred" to "💯",
    "lightning" to "⚡",
    "dove" to "🕊️",
    "jack_o_lantern" to "🎃",
    "nail_polish" to "💅",
    "clown" to "🤡",
    "moai" to "🗿",
    "cool_button" to "🆒",
    "neutral" to "😐",
    "sleep" to "😴",
    "raised_eyebrow" to "🤨",
    "shrug_man" to "🤷‍♂️",
    "shrug_woman" to "🤷‍♀️"
)

private fun toggleReaction(user: FirebaseUser, postId: String, emoji: String, done: (String?) -> Unit) {
    val db = FirebaseRuntime.db ?: run { done("Firebase belum dikonfigurasi."); return }
    if (emoji !in ReactionOptions.map { it.second }) {
        done("Jenis reaksi tidak valid.")
        return
    }
    val postRef = db.collection("posts").document(postId)
    val reactionRef = postRef.collection("likes").document(user.uid)
    db.runTransaction { transaction ->
        val postSnapshot = transaction.get(postRef)
        val reactionSnapshot = transaction.get(reactionRef)
        if (!postSnapshot.exists()) throw IllegalStateException("Postingan sudah tidak tersedia.")

        val counts = (postSnapshot.get("reactions") as? Map<*, *>)
            ?.mapNotNull { (key, value) -> if (key is String && value is Number) key to value.toLong() else null }
            ?.toMutableMap() ?: mutableMapOf()
        // Keep every required aggregate key present, including on older/malformed documents.
        counts.keys.toList().forEach { key -> counts[key] = (counts[key] ?: 0L).coerceAtLeast(0L) }
        // Existing legacy likes without an emoji are treated as 👍 by Firestore Rules.
        val previousEmoji = if (reactionSnapshot.exists()) reactionSnapshot.getString("emoji") ?: "👍" else null
        val oldKey = previousEmoji?.let { previous -> ReactionOptions.firstOrNull { it.second == previous }?.first }
        val targetKey = emoji

        if (oldKey == targetKey) {
            transaction.delete(reactionRef)
            counts[targetKey] = ((counts[targetKey] ?: 0L) - 1L).coerceAtLeast(0L)
            transaction.update(postRef, "reactions", counts, "totalReactions",
                ((postSnapshot.getLong("totalReactions") ?: 0L) - 1L).coerceAtLeast(0L))
        } else {
            if (reactionSnapshot.exists()) {
                transaction.update(reactionRef, "emoji", emoji)
                if (oldKey != null) counts[oldKey] = ((counts[oldKey] ?: 0L) - 1L).coerceAtLeast(0L)
            } else {
                transaction.set(reactionRef, mapOf(
                    "uid" to user.uid,
                    "createdAt" to FieldValue.serverTimestamp(),
                    "emoji" to emoji
                ))
            }
            counts[targetKey] = (counts[targetKey] ?: 0L) + 1L
            val oldTotal = postSnapshot.getLong("totalReactions") ?: 0L
            transaction.update(postRef, "reactions", counts, "totalReactions", oldTotal + if (reactionSnapshot.exists()) 0L else 1L)
        }
    }.addOnSuccessListener { done(null) }
        .addOnFailureListener { error ->
            done(if (error.message?.contains("PERMISSION_DENIED", ignoreCase = true) == true)
                "Reaksi ditolak oleh aturan Firestore. Data tidak diubah."
            else "Reaksi gagal disimpan. Periksa koneksi lalu coba lagi.")
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
    currentUserId: String,
    prompt: String,
    onPost: (String, String, (String?) -> Unit) -> Unit,
    onReact: (String, String, (String?) -> Unit) -> Unit
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
                        var showReactionPicker by remember(post.id) { mutableStateOf(false) }
                        Row(
                            modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(2.dp)
                        ) {
                            ReactionOptions.filter { (key, _) -> (post.reactions[key] ?: 0L) > 0L }
                                .forEach { (key, emoji) ->
                                    val count = post.reactions[key] ?: 0L
                                    TextButton(
                                        onClick = { onReact(post.id, emoji) { result -> if (result != null) message = result } },
                                        modifier = Modifier.padding(horizontal = 0.dp)
                                    ) {
                                        Text("$emoji $count", fontSize = 12.sp, color = WarkopBlue)
                                    }
                                }
                            TextButton(onClick = { showReactionPicker = !showReactionPicker }) {
                                Text(if (showReactionPicker) "✕" else "☺️ +", fontSize = 13.sp, color = Muted)
                            }
                            Text("${post.totalReactions} reaksi", color = Muted, fontSize = 11.sp)
                        }
                        if (showReactionPicker) {
                            Row(
                                modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                                horizontalArrangement = Arrangement.spacedBy(4.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                ReactionOptions.forEach { (_, emoji) ->
                                    TextButton(
                                        onClick = {
                                            onReact(post.id, emoji) { result -> if (result != null) message = result }
                                            showReactionPicker = false
                                        }
                                    ) { Text(emoji, fontSize = 20.sp) }
                                }
                            }
                        }
                        ReplySection(post.id, currentUserId, profileName)
                    }
                    HorizontalDivider(color = Color(0xFFE7EAF0))
                }
            }
        }
    }
}

@Composable
private fun ReplySection(postId: String, userId: String, displayName: String) {
    val db = FirebaseRuntime.db
    var expanded by remember(postId) { mutableStateOf(false) }
    var replies by remember(postId) { mutableStateOf(emptyList<CommunityReply>()) }
    var draft by remember(postId) { mutableStateOf("") }
    var sending by remember(postId) { mutableStateOf(false) }
    var status by remember(postId) { mutableStateOf<String?>(null) }

    DisposableEffect(postId, expanded, db) {
        if (!expanded || db == null) return@DisposableEffect onDispose { }
        val listener = db.collection("posts").document(postId).collection("replies")
            .orderBy("createdAt", Query.Direction.ASCENDING)
            .limit(50)
            .addSnapshotListener { snapshot, error ->
                if (error != null) {
                    status = "Balasan belum bisa dimuat."
                    return@addSnapshotListener
                }
                replies = snapshot?.documents.orEmpty().map { doc ->
                    CommunityReply(
                        id = doc.id,
                        authorName = doc.getString("authorName").orEmpty().ifBlank { "Anggota" },
                        body = doc.getString("body").orEmpty()
                    )
                }
            }
        onDispose { listener.remove() }
    }

    TextButton(onClick = { expanded = !expanded; status = null }) {
        Text(if (expanded) "Sembunyikan balasan" else "Balas · lihat balasan", fontSize = 12.sp)
    }
    if (expanded) {
        Column(
            Modifier.fillMaxWidth().padding(start = 12.dp, top = 2.dp, bottom = 6.dp)
                .background(Color(0xFFF7F8FC), RoundedCornerShape(10.dp)).padding(10.dp)
        ) {
            if (replies.isEmpty()) {
                Text("Belum ada balasan. Mulai percakapan di sini.", color = Muted, fontSize = 12.sp)
            } else {
                replies.forEach { reply ->
                    Column(Modifier.fillMaxWidth().padding(vertical = 5.dp)) {
                        Text(reply.authorName, color = WarkopInk, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                        Text(reply.body, color = WarkopInk, fontSize = 13.sp, lineHeight = 18.sp)
                    }
                }
            }
            Spacer(Modifier.height(6.dp))
            OutlinedTextField(
                value = draft,
                onValueChange = { if (it.length <= 1000) draft = it },
                modifier = Modifier.fillMaxWidth(),
                placeholder = { Text("Tulis balasan…") },
                minLines = 1,
                maxLines = 4
            )
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                Button(
                    enabled = !sending && draft.isNotBlank() && displayName.trim().length >= 2,
                    onClick = {
                        val text = draft.trim()
                        if (text.isEmpty()) return@Button
                        sending = true
                        status = null
                        val ref = db?.collection("posts")?.document(postId)?.collection("replies")?.document()
                        if (ref == null) {
                            sending = false
                            status = "Firebase belum tersedia."
                        } else {
                            ref.set(mapOf(
                                "authorId" to userId,
                                "authorName" to displayName.trim(),
                                "body" to text,
                                "createdAt" to FieldValue.serverTimestamp()
                            )).addOnSuccessListener {
                                sending = false
                                draft = ""
                                status = "Balasan terkirim."
                            }.addOnFailureListener {
                                sending = false
                                status = "Balasan gagal dikirim. Periksa profil dan aturan Firestore."
                            }
                        }
                    }
                ) { Text(if (sending) "Mengirim…" else "Kirim balasan") }
            }
            if (status != null) Text(status!!, color = if (status!!.contains("gagal")) Color(0xFFB42318) else Muted, fontSize = 11.sp)
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
