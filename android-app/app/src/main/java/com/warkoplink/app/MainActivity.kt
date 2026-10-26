package com.warkoplink.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChatBubbleOutline
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.PersonOutline
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private val WarkopBlue = Color(0xFF185ADB)
private val WarkopInk = Color(0xFF17233C)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme(
                colorScheme = lightColorScheme(
                    primary = WarkopBlue,
                    secondary = Color(0xFF7655D9),
                    background = Color(0xFFF5F7FC),
                    surface = Color.White
                )
            ) {
                WarkopLinkApp()
            }
        }
    }
}

@Composable
private fun WarkopLinkApp() {
    var selectedTab by remember { mutableIntStateOf(0) }
    Scaffold(
        bottomBar = {
            NavigationBar {
                NavigationBarItem(
                    selected = selectedTab == 0,
                    onClick = { selectedTab = 0 },
                    icon = { androidx.compose.material3.Icon(Icons.Default.Groups, contentDescription = "Komunitas") },
                    label = { Text("Komunitas") }
                )
                NavigationBarItem(
                    selected = selectedTab == 1,
                    onClick = { selectedTab = 1 },
                    icon = { androidx.compose.material3.Icon(Icons.Default.ChatBubbleOutline, contentDescription = "Obrolan") },
                    label = { Text("Obrolan") }
                )
                NavigationBarItem(
                    selected = selectedTab == 2,
                    onClick = { selectedTab = 2 },
                    icon = { androidx.compose.material3.Icon(Icons.Default.PersonOutline, contentDescription = "Profil") },
                    label = { Text("Profil") }
                )
            }
        }
    ) { innerPadding ->
        Surface(
            modifier = Modifier.fillMaxSize().padding(innerPadding),
            color = MaterialTheme.colorScheme.background
        ) {
            when (selectedTab) {
                0 -> CommunityHome()
                1 -> SimpleNotice("Obrolan", "Ruang diskusi berbasis topik akan dikembangkan pada tahap berikutnya.")
                else -> SimpleNotice("Profil", "Login dan profil anggota menjadi tahap integrasi berikutnya.")
            }
        }
    }
}

@Composable
private fun CommunityHome() {
    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(horizontal = 20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        item {
            Spacer(Modifier.height(18.dp))
            Text("WarkopLink", fontSize = 29.sp, fontWeight = FontWeight.ExtraBold, color = WarkopInk)
            Text("Tempat ngobrol, berbagi, dan terhubung.", color = Color(0xFF5E6A80))
            Spacer(Modifier.height(8.dp))
        }
        item {
            Card(
                shape = RoundedCornerShape(24.dp),
                colors = CardDefaults.cardColors(containerColor = WarkopBlue)
            ) {
                Column(Modifier.padding(20.dp)) {
                    Text("Halo, teman!", color = Color.White, fontSize = 22.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(6.dp))
                    Text(
                        "Komunitas digital yang dekat dengan keseharianmu.",
                        color = Color.White
                    )
                    Spacer(Modifier.height(14.dp))
                    Button(onClick = {}, enabled = false) {
                        Text("Mulai bergabung — segera hadir")
                    }
                }
            }
        }
        item {
            Text("Jelajahi komunitas", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = WarkopInk)
        }
        item { FeatureCard("Obrolan berbasis topik", "Ikuti percakapan sesuai minat dan komunitasmu.") }
        item { FeatureCard("Posting teks dan foto", "Berbagi cerita dengan pengalaman yang ringan.") }
        item { FeatureCard("Profil anggota", "Kenali anggota dan bangun koneksi baru.") }
        item {
            Row(
                modifier = Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 24.dp),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("Fondasi Android • Versi 0.1.0", color = Color(0xFF778198), fontSize = 12.sp)
            }
        }
    }
}

@Composable
private fun FeatureCard(title: String, description: String) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White)
    ) {
        Column(Modifier.padding(18.dp)) {
            Text(title, fontWeight = FontWeight.Bold, color = WarkopInk)
            Spacer(Modifier.height(5.dp))
            Text(description, color = Color(0xFF5E6A80))
        }
    }
}

@Composable
private fun SimpleNotice(title: String, description: String) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(title, fontSize = 26.sp, fontWeight = FontWeight.Bold, color = WarkopInk)
        Spacer(Modifier.height(10.dp))
        Text(description, color = Color(0xFF5E6A80))
    }
}
